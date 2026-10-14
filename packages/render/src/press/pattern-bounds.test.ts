import { expect, test } from 'bun:test'
import { type PDFDict, PDFDocument } from 'pdf-lib'
import { type PaintedBounds, recordPatternPaintedBounds } from './pattern-bounds.ts'

const bytes = (source: string) => new TextEncoder().encode(source)

async function setup() {
  const document = await PDFDocument.create()
  const pattern = document.context.obj({ Type: 'Pattern', PatternType: 2 }) as PDFDict
  const other = document.context.obj({ Type: 'Pattern', PatternType: 2 }) as PDFDict
  const resolve = (name: string) => (name === 'P1' ? pattern : name === 'P2' ? other : undefined)
  const bounds: PaintedBounds = new WeakMap()
  return { bounds, other, pattern, resolve }
}

test('nested q/Q with cm maps the fill through the concatenated matrix', async () => {
  const { bounds, pattern, resolve } = await setup()
  recordPatternPaintedBounds(bytes('1 0 0 1 10 20 cm q 2 0 0 2 0 0 cm /Pattern cs /P1 scn 0 0 10 10 re f Q'), resolve, bounds)
  expect(bounds.get(pattern)).toEqual({ x0: 10, y0: 20, x1: 30, y1: 40 })
})

test('two uses of one pattern union their painted boxes', async () => {
  const { bounds, pattern, resolve } = await setup()
  recordPatternPaintedBounds(bytes('/Pattern cs /P1 scn 0 0 10 10 re f 20 5 5 15 re f'), resolve, bounds)
  expect(bounds.get(pattern)).toEqual({ x0: 0, y0: 0, x1: 25, y1: 20 })
})

test('a non-rectangular path records the bounds of its points', async () => {
  const { bounds, pattern, resolve } = await setup()
  recordPatternPaintedBounds(bytes('/Pattern cs /P1 scn 2 3 m 12 3 l 2 13 l h f'), resolve, bounds)
  expect(bounds.get(pattern)).toEqual({ x0: 2, y0: 3, x1: 12, y1: 13 })
})

test('Do while a pattern is selected marks the pattern unbounded', async () => {
  const { bounds, pattern, resolve } = await setup()
  recordPatternPaintedBounds(bytes('/Pattern cs /P1 scn 0 0 10 10 re f /Fm1 Do 0 0 1 1 re f'), resolve, bounds)
  expect(bounds.get(pattern)).toBe('unbounded')
})
