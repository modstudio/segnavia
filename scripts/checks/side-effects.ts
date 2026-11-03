// Keeps package side-effect declarations aligned with modules that register
// custom elements when imported.

import ts from 'typescript'
import type { Finding } from './rules.ts'

export interface SideEffectsPackage {
  path: string
  sideEffects: string[]
  sources: { path: string; text: string }[]
}

const TEST_FILE = /\.(?:test|spec)\.[mc]?[jt]sx?$/

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

function isCustomElementDefinition(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false
  const receiver = node.expression.expression
  return ts.isIdentifier(receiver) && receiver.text === 'customElements' && node.expression.name.text === 'define'
}

// A call is at module level when no function-like or class node contains it.
// Control-flow bodies do not change that status, so a top-level loop counts.
export function registersCustomElementAtModuleLevel(path: string, text: string): boolean {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  let found = false
  const visit = (node: ts.Node, insideFunctionOrClass: boolean) => {
    const inside = insideFunctionOrClass || functionOrClass(node)
    if (!inside && isCustomElementDefinition(node)) found = true
    if (!found) ts.forEachChild(node, (child) => visit(child, inside))
  }
  visit(source, false)
  return found
}

function builtPath(source: string): string {
  const relative = source.slice(source.indexOf('/src/') + '/src/'.length)
  return `./dist/${relative.replace(/\.ts$/, '.js')}`
}

export function checkSideEffects(pkg: SideEffectsPackage): Finding[] {
  const registering = new Map(
    pkg.sources
      .filter((source) => !TEST_FILE.test(source.path) && registersCustomElementAtModuleLevel(source.path, source.text))
      .map((source) => [builtPath(source.path), source.path]),
  )
  const listed = new Set(pkg.sideEffects)
  const findings: Finding[] = []
  for (const [output, source] of registering) {
    if (!listed.has(output))
      findings.push({ rule: 'side-effects', path: source, message: `defines an element at load but ${output} is not in ${pkg.path} sideEffects; add it.` })
  }
  for (const output of listed) {
    // Browser outputs are bundles declared by the browser build config rather
    // than one-to-one source outputs, so their listed names are accepted.
    if (output.startsWith('./dist/browser/')) continue
    if (!registering.has(output))
      findings.push({ rule: 'side-effects', path: pkg.path, message: `${output} does not register an element at load; remove it from sideEffects.` })
  }
  return findings
}
