import path from 'node:path'
import ts from 'typescript'

export type VacuityFinding = {
  line: number
  message: string
}

const TEST_CALLS = new Set(['it', 'test'])
const SUITE_CALLS = new Set(['describe', 'suite'])
const NOT_TESTS = new Set(['afterAll', 'afterEach', 'beforeAll', 'beforeEach', 'setTimeout', 'step', 'use'])
const WAIVER = /\/\/\s*vacuity-allow:\s*\S/

function callChain(expression: ts.Expression): { root: string; modifiers: string[] } | undefined {
  const modifiers: string[] = []
  let node = expression
  for (;;) {
    if (ts.isCallExpression(node)) {
      node = node.expression
      continue
    }
    if (ts.isPropertyAccessExpression(node)) {
      modifiers.unshift(node.name.text)
      node = node.expression
      continue
    }
    if (ts.isIdentifier(node)) return { root: node.text, modifiers }
    return undefined
  }
}

function contains(root: ts.Node, predicate: (node: ts.Node) => boolean): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (predicate(node)) {
      found = true
      return
    }
    node.forEachChild(visit)
  }
  visit(root)
  return found
}

function hasWaiver(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const source = sourceFile.getFullText()
  const comments = ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []
  return comments.some((comment) => WAIVER.test(source.slice(comment.pos, comment.end)))
}

function isAssertion(node: ts.Node, file: string): boolean {
  if (!ts.isCallExpression(node)) return false
  const chain = callChain(node.expression)
  if (!chain) return false
  if (chain.root === 'expect' || chain.root === 'assert' || chain.root === 'toThrow' || chain.modifiers.includes('toThrow')) return true
  return path.normalize(file).startsWith(path.join('scripts', 'verify') + path.sep) && chain.root === 'check'
}

function declarationKind(chain: { root: string; modifiers: string[] }): 'test' | 'suite' | undefined {
  if (SUITE_CALLS.has(chain.root) || chain.modifiers.includes('describe')) return 'suite'
  if (TEST_CALLS.has(chain.root) && !chain.modifiers.some((modifier) => NOT_TESTS.has(modifier))) return 'test'
  return undefined
}

export function testVacuityFindings(file: string, source: string): VacuityFinding[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const findings: VacuityFinding[] = []
  const titles = new Set<string>()
  const report = (node: ts.Node, message: string): void => {
    findings.push({ line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1, message })
  }

  const inspectTest = (node: ts.CallExpression, literalTitle: string | undefined, body: ts.Expression | undefined): void => {
    if (literalTitle !== undefined) {
      if (titles.has(literalTitle)) report(node, `duplicate test title in this file: "${literalTitle}"`)
      titles.add(literalTitle)
    }
    if (!body) return
    if (contains(body, (child) => isAssertion(child, file))) return
    if (hasWaiver(sourceFile, node)) return
    report(node, 'test body contains no assertion; add one or explain the helper with `// vacuity-allow: <reason>`')
  }

  const inspectCall = (node: ts.CallExpression): void => {
    const chain = callChain(node.expression)
    if (!chain) return
    const kind = declarationKind(chain)
    if (!kind) return
    const [title] = node.arguments
    const literalTitle = title && ts.isStringLiteralLike(title) ? title.text : undefined
    const body = node.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
    if (!body && literalTitle === undefined) return
    if (chain.modifiers.includes('only')) report(node, 'focused test or suite uses `.only`')
    if (kind === 'test') inspectTest(node, literalTitle, body)
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) inspectCall(node)
    node.forEachChild(visit)
  }

  sourceFile.forEachChild(visit)
  return findings
}
