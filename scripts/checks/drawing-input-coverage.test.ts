import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DRAWING_INPUTS, NON_DRAWING_INPUTS } from '../../architecture.ts'

const ROOT = path.resolve(import.meta.dir, '../..')
const transpiler = new Bun.Transpiler({ loader: 'ts' })
const frameManifest = JSON.parse(readFileSync(path.join(ROOT, 'packages/frame/package.json'), 'utf8')) as {
  exports: Record<string, { '@segnavia/source': string }>
}

function frameEntry(specifier: string): string | undefined {
  if (!specifier.startsWith('@segnavia/frame')) return undefined
  const suffix = specifier.slice('@segnavia/frame'.length)
  const entry = suffix === '' ? '.' : `.${suffix}`
  const source = frameManifest.exports[entry]?.['@segnavia/source']
  return source ? path.posix.join('packages/frame', source) : undefined
}

function drawingPathImport(source: string, specifier: string): string | undefined {
  if (specifier.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier))
  return frameEntry(specifier)
}

test('declared lists cover frame and render imports on the drawing path', () => {
  const drawing = new Set<string>(DRAWING_INPUTS)
  const nonDrawing = new Set<string>(NON_DRAWING_INPUTS)
  expect([...drawing].filter((source) => nonDrawing.has(source))).toEqual([])
  expect([...drawing, ...nonDrawing].filter((source) => !existsSync(path.join(ROOT, source)))).toEqual([])

  const unclassified = new Set<string>()
  for (const source of DRAWING_INPUTS) {
    if (!source.startsWith('packages/frame/') && !source.startsWith('packages/render/')) continue
    const text = readFileSync(path.join(ROOT, source), 'utf8')
    for (const scanned of transpiler.scanImports(text)) {
      const imported = drawingPathImport(source, scanned.path)
      if (!imported || (!imported.startsWith('packages/frame/') && !imported.startsWith('packages/render/'))) continue
      if (!drawing.has(imported) && !nonDrawing.has(imported)) unclassified.add(imported)
    }
  }
  expect([...unclassified].sort()).toEqual([])
})
