// Keeps package side-effect declarations aligned with modules that run code
// when imported. The source condition and browser build resolve src modules,
// while published consumers resolve dist modules, so both forms must be
// declared side-effecting.

import ts from 'typescript'
import type { Finding } from './rules.ts'

export interface SideEffectsPackage {
  path: string
  sideEffects: string[]
  sources: { path: string; text: string }[]
}

const TEST_FILE = /\.(?:test|spec|test-helper)\.[mc]?[jt]sx?$/

function functionOrClass(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  )
}

function callsFunction(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) return true
  if (functionOrClass(node)) return false
  let found = false
  ts.forEachChild(node, (child) => {
    if (!found && callsFunction(child)) found = true
  })
  return found
}

// An effect statement is at module level when no function-like or class node
// contains it. Control-flow bodies do not change that status, so a top-level
// loop counts. Calls in declaration initializers are not effect statements.
export function runsCodeAtModuleLevel(path: string, text: string): boolean {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  let found = false
  const visit = (node: ts.Node, insideFunctionOrClass: boolean) => {
    const inside = insideFunctionOrClass || functionOrClass(node)
    if (!inside && ts.isExpressionStatement(node) && callsFunction(node.expression)) found = true
    if (!found) ts.forEachChild(node, (child) => visit(child, inside))
  }
  visit(source, false)
  return found
}

function builtPath(source: string): string {
  const relative = source.slice(source.indexOf('/src/') + '/src/'.length)
  return `./dist/${relative.replace(/\.ts$/, '.js')}`
}

function sourcePath(source: string): string {
  return `./${source.slice(source.indexOf('/src/') + 1)}`
}

export function checkSideEffects(pkg: SideEffectsPackage): Finding[] {
  const effectful = pkg.sources.filter((source) => !TEST_FILE.test(source.path) && runsCodeAtModuleLevel(source.path, source.text))
  const required = new Map(
    effectful.flatMap((source) => [
      [builtPath(source.path), source.path],
      [sourcePath(source.path), source.path],
    ]),
  )
  const listed = new Set(pkg.sideEffects)
  const findings: Finding[] = []
  for (const [entry, source] of required) {
    if (!listed.has(entry))
      findings.push({ rule: 'side-effects', path: source, message: `runs code when imported but ${entry} is not in ${pkg.path} sideEffects; add it.` })
  }
  for (const entry of listed) {
    // Browser outputs are bundles declared by the browser build config rather
    // than one-to-one source outputs, so their listed names are accepted.
    if (entry.startsWith('./dist/browser/')) continue
    if (!required.has(entry))
      findings.push({ rule: 'side-effects', path: pkg.path, message: `${entry} does not run code when imported; remove it from sideEffects.` })
  }
  return findings
}
