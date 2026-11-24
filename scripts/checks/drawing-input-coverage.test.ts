import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DRAWING_INPUTS, NON_DRAWING_INPUTS } from '../../architecture.ts'

const ROOT = path.resolve(import.meta.dir, '../..')
const transpiler = new Bun.Transpiler({ loader: 'ts' })
type SourceManifest = {
  exports: Record<string, { '@segnavia/source': string }>
}
const manifests = new Map(
  ['frame', 'layout'].map((packageName) => [
    packageName,
    JSON.parse(readFileSync(path.join(ROOT, `packages/${packageName}/package.json`), 'utf8')) as SourceManifest,
  ]),
)

function packageEntry(specifier: string): string | undefined {
  const match = /^@segnavia\/(frame|layout)(.*)$/.exec(specifier)
  if (!match) return undefined
  const packageName = match[1]
  const suffix = match[2]
  if (!packageName || suffix === undefined) return undefined
  const entry = suffix === '' ? '.' : `.${suffix}`
  const source = manifests.get(packageName)?.exports[entry]?.['@segnavia/source']
  return source ? path.posix.join('packages', packageName, source) : undefined
}

function drawingPathImport(source: string, specifier: string): string | undefined {
  if (specifier.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier))
  return packageEntry(specifier)
}

test('declared lists cover the reachable drawing path', () => {
  const drawing = new Set<string>(DRAWING_INPUTS)
  const nonDrawing = new Set<string>(NON_DRAWING_INPUTS)
  expect([...drawing].filter((source) => nonDrawing.has(source))).toEqual([])
  expect([...drawing, ...nonDrawing].filter((source) => !existsSync(path.join(ROOT, source)))).toEqual([])

  const roots = ['packages/render/src/page-image-render.ts', 'packages/render/src/slide-image.ts', 'packages/render/src/cover-image.ts']
  const reachable = new Set<string>()
  const pending = [...roots]
  while (pending.length > 0) {
    const source = pending.pop()
    if (!source || reachable.has(source)) continue
    reachable.add(source)
    const text = readFileSync(path.join(ROOT, source), 'utf8')
    for (const scanned of transpiler.scanImports(text)) {
      const imported = drawingPathImport(source, scanned.path)
      if (!imported || !/^packages\/(frame|render|layout)\//.test(imported)) continue
      pending.push(imported)
    }
  }
  expect([...reachable].filter((source) => !drawing.has(source) && !nonDrawing.has(source)).sort()).toEqual([])
})
