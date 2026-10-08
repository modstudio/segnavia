// The repository's own rules as pure decisions over a file's path, text and
// imports, so the gate can test them and the runner only gathers facts.

import { FILE_CEILING_LINES, type PackageRule } from '../../architecture.ts'

export interface SourceFile {
  path: string
  text: string
  imports: string[]
}

export interface Workspace {
  name: string
  rule: PackageRule
  exports: string[]
  dependencies: string[]
}

export interface Finding {
  rule: string
  path: string
  message: string
}

export interface ResolutionInputs {
  sourceCondition: string
  packages: { path: string; exports: Record<string, Record<string, string>> }[]
  customConditions: string[]
  scripts: Record<string, string>
}

const NODE_GLOBALS = /\b(?:Buffer|process|__dirname|require)\b/

function bareName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

function subpath(specifier: string): string {
  const name = bareName(specifier)
  return specifier === name ? '.' : `.${specifier.slice(name.length)}`
}

// The package a file belongs to, as `packages/<name>/...`.
export function packageOf(path: string): string | null {
  const match = /^packages\/([^/]+)\//.exec(path)
  return match ? (match[1] ?? null) : null
}

function checkRelative(file: SourceFile, workspace: Workspace, within: string, specifier: string): Finding[] {
  const findings: Finding[] = []
  const depth = within.split('/').length - 1
  const ups = specifier.split('/').filter((part) => part === '..').length
  if (ups >= depth)
    findings.push({ rule: 'architecture', path: file.path, message: `"${specifier}" reaches outside the package; import another package by name.` })
  const safe = workspace.rule.serverSafe ?? []
  if (safe.includes(within) && !safe.some((entry) => specifier.endsWith(entry.replace(/^src\//, '')))) {
    findings.push({ rule: 'architecture', path: file.path, message: `a server-safe entry point imports "${specifier}", which is browser-only.` })
  }
  return findings
}

function checkBare(file: SourceFile, workspace: Workspace, all: Map<string, Workspace>, specifier: string): Finding[] {
  if (specifier === 'bun:test') return []
  if (specifier.startsWith('node:')) {
    return workspace.rule.runtime === 'server'
      ? []
      : [{ rule: 'architecture', path: file.path, message: `a ${workspace.rule.runtime} package imports ${specifier}.` }]
  }
  const name = bareName(specifier)
  if (!workspace.rule.imports.includes(name)) {
    return [{ rule: 'architecture', path: file.path, message: `${workspace.name} may not import ${name}; declare it in architecture.ts if it belongs.` }]
  }
  const target = all.get(name)
  if (target && !target.exports.includes(subpath(specifier))) {
    return [{ rule: 'architecture', path: file.path, message: `${specifier} is not an entry point ${name} exports.` }]
  }
  return []
}

export function checkImports(file: SourceFile, workspace: Workspace, all: Map<string, Workspace>): Finding[] {
  const within = file.path.slice(`packages/${packageOf(file.path)}/`.length)
  const findings = file.imports.flatMap((specifier) =>
    specifier.startsWith('.') ? checkRelative(file, workspace, within, specifier) : checkBare(file, workspace, all, specifier),
  )
  if (workspace.rule.runtime !== 'server' && !file.path.endsWith('.test.ts') && NODE_GLOBALS.test(stripComments(file.text))) {
    findings.push({ rule: 'architecture', path: file.path, message: `a ${workspace.rule.runtime} package uses a Node global.` })
  }
  return findings
}

// What package.json declares must be exactly what architecture.ts allows, so
// neither can drift without the other.
export function checkManifest(workspace: Workspace): Finding[] {
  const path = `packages/${workspace.name.replace('@segnavia/', '')}/package.json`
  const findings: Finding[] = []
  for (const name of workspace.rule.imports) {
    if (!workspace.dependencies.includes(name)) findings.push({ rule: 'architecture', path, message: `${name} is allowed but not a dependency.` })
  }
  for (const name of workspace.dependencies) {
    if (!workspace.rule.imports.includes(name))
      findings.push({ rule: 'architecture', path, message: `${name} is a dependency that architecture.ts does not allow.` })
  }
  return findings
}

export function checkSourceResolution(inputs: ResolutionInputs): Finding[] {
  const findings: Finding[] = []
  const sourceCondition = inputs.sourceCondition
  for (const manifest of inputs.packages) {
    for (const [name, conditions] of Object.entries(manifest.exports)) {
      const keys = Object.keys(conditions)
      if (keys[0] !== sourceCondition) {
        findings.push({
          rule: 'source-resolution',
          path: manifest.path,
          message: `${name} must list ${sourceCondition} as its first export condition.`,
        })
      }
      for (const condition of keys.filter((key) => key.startsWith('@segnavia/') && key !== sourceCondition)) {
        findings.push({
          rule: 'source-resolution',
          path: manifest.path,
          message: `${name} names unknown source condition ${condition}; use ${sourceCondition}.`,
        })
      }
    }
  }
  if (inputs.customConditions.length !== 1 || inputs.customConditions[0] !== sourceCondition) {
    findings.push({
      rule: 'source-resolution',
      path: 'tsconfig.json',
      message: `customConditions must contain only ${sourceCondition}.`,
    })
  }
  for (const [name, script] of Object.entries(inputs.scripts)) {
    for (const match of script.matchAll(/--conditions=([^\s]+)/g)) {
      if (match[1] !== sourceCondition) {
        findings.push({
          rule: 'source-resolution',
          path: 'package.json',
          message: `script ${name} names source condition ${match[1]}; use ${sourceCondition}.`,
        })
      }
    }
  }
  return findings
}

// Where the token starting at `i` ends, for a comment or a string literal.
function commentEnd(text: string, i: number): number | null {
  if (text.startsWith('//', i)) {
    const end = text.indexOf('\n', i)
    return end === -1 ? text.length : end
  }
  if (text.startsWith('/*', i)) {
    const end = text.indexOf('*/', i + 2)
    return end === -1 ? text.length : end + 2
  }
  return null
}

function stringEnd(text: string, i: number): number | null {
  const quote = text[i]
  if (quote !== "'" && quote !== '"' && quote !== '`') return null
  let j = i + 1
  while (j < text.length && text[j] !== quote) j += text[j] === '\\' ? 2 : 1
  return j + 1
}

// Splits source into its comments and everything else, skipping string and
// template literals so a `//` inside one is never read as a comment.
function scan(text: string): { code: string; comments: string[] } {
  let code = ''
  const found: string[] = []
  let i = 0
  while (i < text.length) {
    const comment = commentEnd(text, i)
    if (comment !== null) {
      found.push(text.slice(i, comment))
      i = comment
      continue
    }
    const end = stringEnd(text, i) ?? i + 1
    code += text.slice(i, end)
    i = end
  }
  return { code, comments: found }
}

export function stripComments(text: string): string {
  return scan(text).code
}

export function comments(text: string): string[] {
  return scan(text).comments
}

export function checkHostNames(file: SourceFile, names: string[]): Finding[] {
  const lower = file.text.toLowerCase()
  return names
    .filter((name) => lower.includes(name.toLowerCase()))
    .map((name) => ({
      rule: 'host-names',
      path: file.path,
      message: `names the host "${name}"; code serves every host alike, and adoption notes belong in docs/.`,
    }))
}

// A comment states what the code does now and why. These phrases tell how it
// came to be, which git already records.
export const NARRATION = [
  /\bused to (?:be|have)\b/i,
  /\bformerly\b/i,
  /\bpreviously\b/i,
  /\bback when\b/i,
  /\bwas omitted\b/i,
  /\bthis replaces?d?\b/i,
  /\bthe first draft\b/i,
  /\brestores? the (?:earlier|old|previous)\b/i,
  /\b[A-Z][A-Z0-9]+-\d+\b/,
]

export function checkComments(file: SourceFile): Finding[] {
  const findings: Finding[] = []
  for (const comment of comments(file.text)) {
    const phrase = NARRATION.find((pattern) => pattern.test(comment))
    if (phrase)
      findings.push({
        rule: 'comments',
        path: file.path,
        message: `a comment narrates history or cites a tracker key (${phrase}): "${comment.trim().slice(0, 80)}"`,
      })
  }
  return findings
}

export function checkCeiling(file: SourceFile): Finding[] {
  const lines = file.text.split('\n').length
  return lines > FILE_CEILING_LINES
    ? [{ rule: 'ceiling', path: file.path, message: `${lines} lines; the ceiling is ${FILE_CEILING_LINES}. Split out a concern.` }]
    : []
}
