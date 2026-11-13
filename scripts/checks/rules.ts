// The repository's own rules as pure decisions over a file's path, text and
// imports, so the gate can test them and the runner only gathers facts.

import { readFileSync } from 'node:fs'
import { BUN_SUPPORTED_PACKAGES, FILE_CEILING_LINES, type PackageRule } from '../../architecture.ts'
import { CHROMIUM_ENVIRONMENT_VARIABLE, CHROMIUM_PATH_MODULE } from '../chromium-path.ts'
import { entriesRegion, entryRows, entryTable, firstDifferingEntry, missingSourceCondition, type PackageExports, sourceConditionRefusal } from './readme.ts'
import { blankComments, comments, stripComments } from './source-text.ts'

export interface SourceFile {
  path: string
  text: string
  imports: string[]
}

export interface Workspace {
  name: string
  path: string
  engines?: Record<string, string>
  rule: PackageRule
  exports: string[]
  manifestImports: string[]
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  sources: string[]
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

export interface PackageManifestDependencies {
  name: string
  path: string
  engines?: Record<string, string>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export function checkReadme(name: string, exports: PackageExports, rule: PackageRule, readme: string | null): Finding[] {
  const packageName = name.replace(/^@segnavia\//, '')
  const path = `packages/${packageName}/README.md`
  if (readme === null) {
    return [{ rule: 'readme', path, message: `${name} has no README; add it, then run bun run readmes.` }]
  }
  const region = entriesRegion(readme)
  if (!region) {
    return [{ rule: 'readme', path, message: `${name} is missing its entry markers; add them, then run bun run readmes.` }]
  }
  const missing = missingSourceCondition(exports)
  if (missing) return [{ rule: 'readme', path, message: sourceConditionRefusal(name, missing) }]
  const rows = entryRows(name, exports, rule)
  const actual = readme.slice(region.start, region.end).trim()
  if (actual === entryTable(rows)) return []
  const entry = firstDifferingEntry(actual, rows)
  return [{ rule: 'readme', path, message: `${name} entry ${entry} is stale; run bun run readmes.` }]
}

export function checkBunEngine(workflow: string, manifests: PackageManifestDependencies[]): Finding[] {
  const lines = workflow.split('\n')
  const start = lines.findIndex((line) => /^ {2}verify-render:\s*$/.test(line))
  const end = lines.findIndex((line, index) => index > start && /^ {2}[\w-]+:\s*$/.test(line))
  const job =
    start === -1
      ? undefined
      : lines
          .slice(start + 1, end === -1 ? undefined : end)
          .map((line) => line.replace(/\s+#.*$/, ''))
          .join('\n')
  const ciVersion = job?.match(/^\s+ bun-version:\s*['"]?([^\s'"]+)['"]?\s*$/m)?.[1]
  if (!ciVersion) {
    return [
      {
        rule: 'bun-engine',
        path: '.github/workflows/ci.yml',
        message: "could not read verify-render's bun-version; set it explicitly in .github/workflows/ci.yml.",
      },
    ]
  }
  const expected = `>=${ciVersion}`
  return manifests.flatMap((manifest) => {
    const declared = manifest.engines?.bun
    const packageName = manifest.name.replace(/^@segnavia\//, '')
    const supported = BUN_SUPPORTED_PACKAGES.some((name) => name === packageName)
    if ((supported && declared === expected) || (!supported && !declared)) return []
    const expectedValue = supported ? expected : 'no engines.bun declaration'
    const declaredValue = declared ?? 'no engines.bun declaration'
    return [
      {
        rule: 'bun-engine',
        path: manifest.path,
        message: `${manifest.name} has ${declaredValue}, expected ${expectedValue}, because verify-render in .github/workflows/ci.yml runs Bun ${ciVersion}; change ${manifest.path}, that bun-version or BUN_SUPPORTED_PACKAGES in architecture.ts.`,
      },
    ]
  })
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
  const parts = specifier.split('/')
  const ups = parts.findIndex((part) => part !== '..')
  const leadingUps = ups === -1 ? parts.length : ups
  const importsFixture = parts.includes('test-fixtures')
  const fixtureAllowed =
    /\.(?:test|test-helper)\.ts$/.test(file.path) &&
    leadingUps === depth &&
    parts[leadingUps] === 'test-fixtures' &&
    !parts.slice(leadingUps + 1).includes('..')
  if (importsFixture && /^packages\/[^/]+\/src\//.test(file.path) && !fixtureAllowed)
    findings.push({ rule: 'architecture', path: file.path, message: 'package source may import test fixtures only from a test or test-helper module.' })
  if (leadingUps >= depth && !fixtureAllowed)
    findings.push({ rule: 'architecture', path: file.path, message: `"${specifier}" reaches outside the package; import another package by name.` })
  const safe = workspace.rule.serverSafe ?? []
  const target = new URL(specifier, `file:///${within}`).pathname.replace(/^\//, '').replace(/\.js$/, '.ts')
  if (safe.includes(within) && !safe.includes(target)) {
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
  if (!workspace.rule.imports.includes(name) && !workspace.rule.bundles?.includes(name)) {
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
  const findings = file.imports
    .filter((specifier) => specifier !== 'vue')
    .flatMap((specifier) => (specifier.startsWith('.') ? checkRelative(file, workspace, within, specifier) : checkBare(file, workspace, all, specifier)))
  if (workspace.rule.runtime !== 'server' && !file.path.endsWith('.test.ts') && NODE_GLOBALS.test(stripComments(file.text))) {
    findings.push({ rule: 'architecture', path: file.path, message: `a ${workspace.rule.runtime} package uses a Node global.` })
  }
  return findings
}

// What package.json declares must be exactly what architecture.ts allows, so
// neither can drift without the other.
export function checkManifest(workspace: Workspace): Finding[] {
  const packageName = workspace.name.replace('@segnavia/', '')
  const path = `packages/${packageName}/package.json`
  const findings: Finding[] = []
  for (const name of workspace.rule.imports) {
    if (!workspace.manifestImports.includes(name)) findings.push({ rule: 'architecture', path, message: `${name} is allowed but not a dependency.` })
  }
  for (const name of workspace.manifestImports) {
    if (!workspace.rule.imports.includes(name))
      findings.push({ rule: 'architecture', path, message: `${name} is a dependency that architecture.ts does not allow.` })
  }
  for (const name of workspace.rule.bundles ?? []) {
    if (workspace.devDependencies?.[name] && !workspace.dependencies?.[name] && !workspace.peerDependencies?.[name]) continue
    findings.push({
      rule: 'architecture',
      path,
      message: `${workspace.name} bundles ${name}; put ${name} in devDependencies and remove it from dependencies and peerDependencies to clear this refusal.`,
    })
  }
  for (const entry of workspace.rule.serverSafe ?? []) {
    if (!workspace.sources.includes(`packages/${packageName}/${entry}`))
      findings.push({ rule: 'architecture', path: 'architecture.ts', message: `${workspace.name} serverSafe entry ${entry} names no source file.` })
  }
  return findings
}

export function checkReactDependencies(manifests: PackageManifestDependencies[], allowed: ReadonlySet<string>): Finding[] {
  const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'] as const
  const findings: Finding[] = []
  for (const manifest of manifests) {
    if (allowed.has(manifest.name)) continue
    for (const field of fields) {
      for (const dependency of Object.keys(manifest[field] ?? {}).filter((name) => name === 'react' || name === 'react-dom')) {
        findings.push({
          rule: 'react-dependencies',
          path: manifest.path,
          message: `${manifest.name} names ${dependency} in ${field}; only an allowed React adapter package may name React.`,
        })
      }
    }
  }
  return findings
}

export function checkVueDependencies(manifests: PackageManifestDependencies[]): Finding[] {
  const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'] as const
  const findings: Finding[] = []
  for (const manifest of manifests) {
    for (const field of fields) {
      if (!manifest[field]?.vue) continue
      findings.push({
        rule: 'vue-dependencies',
        path: manifest.path,
        message: `${manifest.name} names vue in ${field}; Vue is supplied only by consumers of a types-only opt-in entry.`,
      })
    }
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
export const TRACKER_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/
const TRACKER_PREFIX = readFileSync(new URL('../../.githooks/key-prefix', import.meta.url), 'utf8').trim()
const README_TRACKER_KEY = new RegExp(`\\b${TRACKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\b`)

export const NARRATION = [
  /\bused to (?:be|have)\b/i,
  /\bformerly\b/i,
  /\bpreviously\b/i,
  /\bback when\b/i,
  /\bwas omitted\b/i,
  /\bthis replaces?d?\b/i,
  /\bthe first draft\b/i,
  /\brestores? the (?:earlier|old|previous)\b/i,
  TRACKER_KEY,
]

export function checkTrackerKeys(file: SourceFile): Finding[] {
  const key = file.text.match(README_TRACKER_KEY)?.[0]
  return key
    ? [{ rule: 'tracker-key', path: file.path, message: `names tracker key ${key}; docs describe the current design without tracker references.` }]
    : []
}

export function readmeFindings({
  name,
  exports,
  rule,
  readme,
  hostNames,
}: {
  name: string
  exports: PackageExports
  rule: PackageRule
  readme: string | null
  hostNames: string[]
}): Finding[] {
  const findings = checkReadme(name, exports, rule, readme)
  if (readme === null) return findings
  const packageName = name.replace(/^@segnavia\//, '')
  const file = { path: `packages/${packageName}/README.md`, text: readme, imports: [] }
  return [...findings, ...checkHostNames(file, hostNames), ...checkTrackerKeys(file)]
}

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

const TYPE_SCRIPT_SUPPRESSIONS = ['nocheck', 'ignore', 'expect-error']

export function checkTypeScriptSuppressions(file: SourceFile): Finding[] {
  if (!/^(?:packages|scripts)\//.test(file.path)) return []
  const directive = TYPE_SCRIPT_SUPPRESSIONS.map((name) => `@ts-${name}`).find((candidate) => file.text.includes(candidate))
  return directive ? [{ rule: 'type-suppression', path: file.path, message: `${directive} disables type safety; fix the types instead.` }] : []
}

export function checkChromiumEnvironmentRead(file: SourceFile): Finding[] {
  if (!file.path.startsWith('scripts/') || file.path === CHROMIUM_PATH_MODULE) return []
  const source = blankComments(file.text)
  const name = CHROMIUM_ENVIRONMENT_VARIABLE
  const accessor = new RegExp(
    `(?:process|Bun)\\.env(?:\\.${name}\\b|\\[\\s*['"]${name}['"]\\s*\\])|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*(?:process|Bun)\\.env\\b`,
  )
  const match = accessor.exec(source)
  if (!match) return []
  const line = source.slice(0, match.index).split('\n').length
  return [
    {
      rule: 'chromium-path',
      path: `${file.path}:${line}`,
      message: 'reads the Chromium environment variable directly; use the shared chromiumPath() lookup.',
    },
  ]
}

export function checkCeiling(file: SourceFile): Finding[] {
  const lines = file.text.split('\n').length
  return lines > FILE_CEILING_LINES
    ? [{ rule: 'ceiling', path: file.path, message: `${lines} lines; the ceiling is ${FILE_CEILING_LINES}. Split out a concern.` }]
    : []
}
