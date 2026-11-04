// Proves the exact tarballs a host installs: every workspace builds, packs,
// passes metadata checks, exposes matching declarations and loads where safe.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { bunSource, PACKAGES, SOURCE_CONDITION, type SourceExport, VUE_MODULE_NAMES, VUE_TYPE_ENTRIES } from '../architecture.ts'

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

async function output(command: string[], cwd: string): Promise<{ code: number; text: string }> {
  const process = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  return { code, text: `${stdout}${stderr}` }
}

function linkConsumerModules(directory: string, includeVue: boolean): void {
  const modules = path.join(directory, 'node_modules')
  mkdirSync(modules, { recursive: true })
  for (const name of readdirSync(path.join(ROOT, 'node_modules'))) {
    if (name === '@segnavia' || name === '.bin' || name === '.bun' || (!includeVue && (VUE_MODULE_NAMES as readonly string[]).includes(name))) continue
    symlinkSync(path.join(ROOT, 'node_modules', name), path.join(modules, name))
  }
  symlinkSync(path.join(HOST, 'node_modules', '@segnavia'), path.join(modules, '@segnavia'))
}

function isVueTypeEntry(packageName: string, exportName: string): boolean {
  const entry = VUE_TYPE_ENTRIES[packageName as keyof typeof VUE_TYPE_ENTRIES]
  return entry?.exportName === exportName
}

function assertEmptyVueEntry(packageName: string, exportName: string, javascript: string): void {
  if (!isVueTypeEntry(packageName, exportName)) return
  const source = new Bun.Transpiler({ loader: 'js' }).scan(javascript)
  const withoutComments = javascript.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').trim()
  if (source.imports.length > 0 || (withoutComments !== '' && withoutComments !== 'export {};')) {
    throw new Error(`@segnavia/${packageName}${exportName.slice(1)} must contain no runtime statements; expected only an empty export {}.`)
  }
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

const diagramProviderKey = Symbol.for('segnavia.diagrams')
const diagramRegistry = globalThis as typeof globalThis & { [diagramProviderKey]?: () => Promise<string> }
if (typeof diagramRegistry[diagramProviderKey] === 'function') {
  throw new Error('@segnavia/diagrams/auto must be the entry that registers the diagram provider.')
}
await import(pathToFileURL(path.join(ROOT, 'packages/diagrams/dist/auto.js')).href)
const builtDiagramProvider: unknown = Reflect.get(diagramRegistry, diagramProviderKey)
if (typeof builtDiagramProvider !== 'function') {
  throw new Error('@segnavia/diagrams/auto must register a diagram provider when imported.')
}
const providedDiagramScript = await builtDiagramProvider()
if (typeof providedDiagramScript !== 'string' || providedDiagramScript.length === 0) {
  throw new Error('@segnavia/diagrams/auto must register a provider that resolves to a non-empty diagram script.')
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
const importsWithoutVue: string[] = []
const serverImports: string[] = []
let alias = 0
for (const { name, directory, manifest } of installed) {
  for (const [exportName, conditions] of Object.entries(manifest.exports)) {
    const target = specifier(manifest.name, exportName)
    const javascript = readFileSync(path.join(directory, conditions.default), 'utf8')
    assertEmptyVueEntry(name, exportName, javascript)
    const names = new Bun.Transpiler({ loader: 'js' }).scan(javascript).exports
    const defaults = names.filter((exported) => exported === 'default')
    const named = names.filter((exported) => exported !== 'default')
    const entryImports: string[] = []
    if (defaults.length > 0) entryImports.push(`import export${alias++} from ${JSON.stringify(target)}`)
    if (named.length > 0) {
      entryImports.push(`import { ${named.map((exported) => `${exported} as export${alias++}`).join(', ')} } from ${JSON.stringify(target)}`)
    }
    if (names.length === 0) entryImports.push(`import ${JSON.stringify(target)}`)
    imports.push(...entryImports)
    if (!isVueTypeEntry(name, exportName)) importsWithoutVue.push(...entryImports)

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

const consumers = mkdtempSync(path.join(tmpdir(), 'segnavia-package-consumers-'))
try {
  const withoutVue = path.join(consumers, 'without-vue')
  linkConsumerModules(withoutVue, false)
  writeFileSync(path.join(withoutVue, 'index.ts'), `${importsWithoutVue.join('\n')}\n`)
  writeFileSync(
    path.join(withoutVue, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      },
      files: ['index.ts'],
    }),
  )
  await run([path.join(ROOT, 'node_modules/.bin/tsc'), '-p', 'tsconfig.json'], withoutVue)

  const withVue = path.join(consumers, 'with-vue')
  linkConsumerModules(withVue, true)
  writeFileSync(
    path.join(withVue, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      },
      include: ['*.ts', '*.vue'],
    }),
  )
  writeFileSync(
    path.join(withVue, 'App.vue'),
    `<script setup lang="ts">
import '@segnavia/frame/vue'
import '@segnavia/markdown-editor/vue'
import type { Deck } from '@segnavia/format'

const deck = { title: 'Typed', slides: [{ id: 'one', content: { kind: 'html', html: '<h1>Typed</h1>' } }] } as Deck
const onMarkdown = (event: CustomEvent<{ markdown: string }>) => event.detail.markdown.toUpperCase()
</script>
<template>
  <segnavia-thumbnail :deck="deck" />
  <segnavia-markdown-editor markdown="Hello" @segnavia-markdown-change="onMarkdown" />
</template>
`,
  )
  const vueTsc = path.join(ROOT, 'node_modules/.bin/vue-tsc')
  await run([vueTsc, '--noEmit', '-p', 'tsconfig.json'], withVue)
  writeFileSync(
    path.join(withVue, 'Bad.vue'),
    `<script setup lang="ts">
import '@segnavia/frame/vue'
</script>
<template><segnavia-thumbnail :deck="'wrong'" /></template>
`,
  )
  const bad = await output([vueTsc, '--noEmit', '-p', 'tsconfig.json'], withVue)
  if (bad.code === 0) throw new Error('vue-tsc accepted a string for the object-valued segnavia-thumbnail deck property.')
  if (!bad.text.includes('Bad.vue') || !bad.text.includes("Type 'string' is not assignable")) {
    throw new Error(`vue-tsc rejected the bad template for an unexpected reason:\n${bad.text}`)
  }
} finally {
  rmSync(consumers, { recursive: true, force: true })
}
