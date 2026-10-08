// The local gate: every check, each failure attributed to the check that
// raised it. `bun run check` runs it, and the pre-commit hook runs it before
// any commit is made.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PACKAGES, SOURCE_CONDITION } from '../architecture.ts'
import {
  checkCeiling,
  checkComments,
  checkHostNames,
  checkImports,
  checkManifest,
  checkSourceResolution,
  type Finding,
  packageOf,
  type Workspace,
} from './checks/rules.ts'

const ROOT = path.resolve(import.meta.dir, '..')
const transpiler = new Bun.Transpiler({ loader: 'ts' })

function hostNames(): string[] {
  const file = path.join(ROOT, 'host-names.local')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

function workspaces(): Map<string, Workspace> {
  const map = new Map<string, Workspace>()
  for (const [name, rule] of Object.entries(PACKAGES)) {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8')) as {
      name: string
      exports: Record<string, string>
      dependencies?: Record<string, string>
    }
    map.set(manifest.name, { name: manifest.name, rule, exports: Object.keys(manifest.exports), dependencies: Object.keys(manifest.dependencies ?? {}) })
  }
  return map
}

const PATTERNS = ['packages/*/src/**/*.ts', 'scripts/**/*.ts', 'fixtures/**/*.ts', 'architecture.ts']

function sources(): string[] {
  const found = new Set<string>()
  for (const pattern of PATTERNS) for (const file of new Bun.Glob(pattern).scanSync({ cwd: ROOT })) found.add(file)
  return [...found].sort()
}

function structural(names: string[]): Finding[] {
  const all = workspaces()
  const findings: Finding[] = []
  for (const workspace of all.values()) findings.push(...checkManifest(workspace))
  const rootManifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  const tsconfig = JSON.parse(readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8')) as { compilerOptions: { customConditions?: string[] } }
  const packages = Object.keys(PACKAGES).map((name) => {
    const relative = `packages/${name}/package.json`
    const manifest = JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8')) as { exports: Record<string, Record<string, string>> }
    return { path: relative, exports: manifest.exports }
  })
  findings.push(
    ...checkSourceResolution({
      sourceCondition: SOURCE_CONDITION,
      packages,
      customConditions: tsconfig.compilerOptions.customConditions ?? [],
      scripts: rootManifest.scripts,
    }),
  )
  for (const name of Object.keys(PACKAGES)) {
    if (!sources().some((file) => file.startsWith(`packages/${name}/`)))
      findings.push({ rule: 'architecture', path: `packages/${name}`, message: 'declared in architecture.ts but has no source.' })
  }
  for (const relative of sources()) {
    const text = readFileSync(path.join(ROOT, relative), 'utf8')
    const file = { path: relative, text, imports: transpiler.scanImports(text).map((entry) => entry.path) }
    const owner = packageOf(relative)
    if (owner) {
      const workspace = all.get(`@segnavia/${owner}`)
      if (!workspace) findings.push({ rule: 'architecture', path: relative, message: `packages/${owner} is not declared in architecture.ts.` })
      else findings.push(...checkImports(file, workspace, all))
      findings.push(...checkHostNames(file, names))
    }
    findings.push(...checkComments(file), ...checkCeiling(file))
  }
  return findings
}

async function run(name: string, command: string[]): Promise<boolean> {
  const proc = Bun.spawn(command, { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) console.error(`\n✗ ${name}\n${(out + err).trim()}`)
  else console.log(`✓ ${name}`)
  return code === 0
}

const names = hostNames()
const findings = structural(names)
for (const finding of findings) console.error(`✗ ${finding.rule}  ${finding.path}: ${finding.message}`)
if (names.length === 0) console.log('! host-name rule was not enforced; create host-names.local to enable it.')
if (findings.length === 0) {
  const rules = names.length === 0 ? 'architecture, comments, file ceiling' : 'architecture, host names, comments, file ceiling'
  console.log(`✓ ${rules} (${sources().length} files)`)
}

const results = [
  await run('biome', ['bunx', 'biome', 'check', '.']),
  await run('typecheck', ['bunx', 'tsc', '--noEmit', '-p', '.']),
  await run('unit tests', ['bun', '--conditions=@segnavia/source', 'test', 'packages', 'scripts']),
  await run('package shape', ['bun', '--conditions=@segnavia/source', 'scripts/check-packages.ts']),
]

const hooks = Bun.spawnSync(['git', 'config', 'core.hooksPath'], { cwd: ROOT }).stdout.toString().trim()
if (hooks !== '.githooks') console.warn('! git hooks are not configured; run `bun run setup`.')

const failed = findings.length > 0 || results.includes(false)
console.log(failed ? '\ncheck failed' : '\ncheck passed')
process.exit(failed ? 1 : 0)
