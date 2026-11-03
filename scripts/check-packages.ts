// Proves the exact tarballs a host installs: every workspace builds, packs,
// passes metadata checks, exposes matching declarations and loads where safe.

import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { bunSource, PACKAGES, SOURCE_CONDITION, type SourceExport } from '../architecture.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const WORK = path.join(ROOT, 'out/package-check')
const TARBALLS = path.join(WORK, 'tarballs')
const HOST = path.join(WORK, 'host')

interface ExportConditions {
  [SOURCE_CONDITION]: SourceExport
  types: string
  default: string
}

interface Manifest {
  name: string
  exports: Record<string, ExportConditions>
  dependencies?: Record<string, string>
}

async function run(command: string[], cwd = ROOT): Promise<void> {
  const process = Bun.spawn(command, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if ((await process.exited) !== 0) throw new Error(`${command.join(' ')} failed.`)
}

function specifier(packageName: string, exportName: string): string {
  return exportName === '.' ? packageName : `${packageName}${exportName.slice(1)}`
}

await run(['bun', 'run', 'build'])
rmSync(WORK, { recursive: true, force: true })
mkdirSync(TARBALLS, { recursive: true })
mkdirSync(path.join(HOST, 'node_modules', '@segnavia'), { recursive: true })

const installed: { name: string; directory: string; manifest: Manifest }[] = []
for (const name of Object.keys(PACKAGES)) {
  const tarball = path.join(TARBALLS, `segnavia-${name}.tgz`)
  await run(['bun', 'pm', 'pack', '--filename', tarball, '--ignore-scripts'], path.join(ROOT, 'packages', name))
  await run(['bunx', 'publint', tarball])
  await run(['bunx', 'attw', '--profile', 'esm-only', tarball])
  const directory = path.join(HOST, 'node_modules', '@segnavia', name)
  mkdirSync(directory, { recursive: true })
  await run(['tar', '-xzf', tarball, '-C', directory, '--strip-components=1'])
  if (!existsSync(path.join(directory, 'LICENSE'))) throw new Error(`${tarball} does not contain LICENSE.`)
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as Manifest
  installed.push({ name, directory, manifest })
}

const frame = installed.find(({ name }) => name === 'frame')
if (!frame) throw new Error('The package check did not install @segnavia/frame.')
for (const [exportName, conditions] of Object.entries(frame.manifest.exports).filter(([, entry]) => entry.default.startsWith('./dist/browser/'))) {
  const file = path.join(frame.directory, conditions.default)
  const imports = new Bun.Transpiler({ loader: 'js' }).scan(readFileSync(file, 'utf8')).imports
  const staticImports = imports.filter(({ kind }) => kind === 'import-statement')
  if (staticImports.length > 0) {
    throw new Error(`${specifier(frame.manifest.name, exportName)} must be one self-contained browser entry; found ${staticImports[0]?.path}.`)
  }
}

const diagramsIndex = path.join(ROOT, 'packages/diagrams/dist/index.js')
const diagramsIndexImports = new Bun.Transpiler({ loader: 'js' }).scan(readFileSync(diagramsIndex, 'utf8')).imports
const staticDiagramScript = diagramsIndexImports.find(
  ({ kind, path: importPath }) => kind === 'import-statement' && /^\.\/script(?:\.[cm]?js)?$/.test(importPath),
)
if (staticDiagramScript) {
  throw new Error(`@segnavia/diagrams must load its script lazily; found static import ${staticDiagramScript.path}.`)
}

const diagramsScript = path.join(ROOT, 'packages/diagrams/dist/script.js')
const diagramsScriptDeclarationsPath = path.join(ROOT, 'packages/diagrams/dist/script.d.ts')
const diagramScriptModule = await import(pathToFileURL(diagramsScript).href)
const diagramScriptExports = Object.keys(diagramScriptModule).sort()
const diagramScriptDeclarations = [
  ...readFileSync(diagramsScriptDeclarationsPath, 'utf8').matchAll(
    /^export declare (?:const|let|var|function|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm,
  ),
]
  .map((match) => match[1] as string)
  .sort()
if (JSON.stringify(diagramScriptExports) !== JSON.stringify(diagramScriptDeclarations)) {
  throw new Error(
    `@segnavia/diagrams/script exports must match its declarations; JavaScript has ${diagramScriptExports.join(', ') || 'none'}, declarations have ${diagramScriptDeclarations.join(', ') || 'none'}.`,
  )
}
if (typeof diagramScriptModule.diagramScript !== 'string' || diagramScriptModule.diagramScript.length === 0) {
  throw new Error('@segnavia/diagrams/script must export a non-empty diagramScript string.')
}

for (const { name, manifest } of installed) {
  for (const dependency of Object.keys(manifest.dependencies ?? {}).filter((dependency) => !dependency.startsWith('@segnavia/'))) {
    const target = path.join(HOST, 'node_modules', dependency)
    if (existsSync(target)) continue
    mkdirSync(path.dirname(target), { recursive: true })
    symlinkSync(path.join(ROOT, 'packages', name, 'node_modules', dependency), target)
  }
}

const imports: string[] = []
const serverImports: string[] = []
let alias = 0
for (const { name, directory, manifest } of installed) {
  for (const [exportName, conditions] of Object.entries(manifest.exports)) {
    const target = specifier(manifest.name, exportName)
    const javascript = readFileSync(path.join(directory, conditions.default), 'utf8')
    const names = new Bun.Transpiler({ loader: 'js' }).scan(javascript).exports
    const defaults = names.filter((exported) => exported === 'default')
    const named = names.filter((exported) => exported !== 'default')
    if (defaults.length > 0) imports.push(`import export${alias++} from ${JSON.stringify(target)}`)
    if (named.length > 0) {
      imports.push(`import { ${named.map((exported) => `${exported} as export${alias++}`).join(', ')} } from ${JSON.stringify(target)}`)
    }
    if (names.length === 0) imports.push(`import ${JSON.stringify(target)}`)

    const rule = PACKAGES[name]
    const source = bunSource(conditions[SOURCE_CONDITION]).replace(/^\.\//, '')
    if (rule?.runtime !== 'browser' || rule.serverSafe?.includes(source)) serverImports.push(target)
  }
}

writeFileSync(path.join(HOST, 'imports.ts'), `${imports.join('\n')}\n`)
await run(
  [
    path.join(ROOT, 'node_modules/.bin/tsc'),
    '--noEmit',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2022',
    '--lib',
    'ES2022,DOM,DOM.Iterable',
    '--skipLibCheck',
    'imports.ts',
  ],
  HOST,
)
await run(['node', '--input-type=module', '--eval', `await Promise.all(${JSON.stringify(serverImports)}.map((name) => import(name)))`], HOST)
