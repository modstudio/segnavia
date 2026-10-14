import { expect, test } from 'bun:test'
import { type PDFDict, PDFDocument } from 'pdf-lib'
import { createPaintedBoundsTracker, MAX_GRAPHICS_SAVE_DEPTH, type PaintedBounds, recordPatternPaintedBounds } from './pattern-bounds.ts'

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

test('a stroked rectangle with 2 w grows the box by the miter margin', async () => {
  const { bounds, pattern, resolve } = await setup()
  recordPatternPaintedBounds(bytes('/Pattern CS /P1 SCN 2 w 0 0 10 10 re S'), resolve, bounds)
  expect(bounds.get(pattern)).toEqual({ x0: -10, y0: -10, x1: 20, y1: 20 })
})

test('a stroked horizontal line grows a degenerate path into a box', async () => {
  const { bounds, pattern, resolve } = await setup()
  recordPatternPaintedBounds(bytes('/Pattern CS /P1 SCN 0 0 m 10 0 l S'), resolve, bounds)
  expect(bounds.get(pattern)).toEqual({ x0: -5, y0: -5, x1: 15, y1: 5 })
})

test('gs applies /LW from the ExtGState to a stroke', async () => {
  const { bounds, pattern, resolve } = await setup()
  const document = await PDFDocument.create()
  const graphicsState = document.context.obj({ Type: 'ExtGState', LW: 4 }) as PDFDict
  recordPatternPaintedBounds(bytes('/GS1 gs /Pattern CS /P1 SCN 0 0 10 10 re S'), resolve, bounds, (name) => (name === 'GS1' ? graphicsState : undefined))
  expect(bounds.get(pattern)).toEqual({ x0: -20, y0: -20, x1: 30, y1: 30 })
})

test('q nesting past MAX_GRAPHICS_SAVE_DEPTH marks the selected pattern unbounded', async () => {
  const { bounds, pattern, resolve } = await setup()
  recordPatternPaintedBounds(bytes(`${'q '.repeat(MAX_GRAPHICS_SAVE_DEPTH + 1)}/Pattern cs /P1 scn 0 0 10 10 re f`), resolve, bounds)
  expect(bounds.get(pattern)).toBe('unbounded')
})

test('feeding a second stream keeps the selected pattern', async () => {
  const { bounds, pattern, resolve } = await setup()
  const tracker = createPaintedBoundsTracker(bounds)
  tracker.feed(bytes('/Pattern cs /P1 scn 0 0 1 1 re f'), resolve)
  tracker.feed(bytes('0 0 10 10 re f'), resolve)
  expect(bounds.get(pattern)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 })
})

test('a clip then sh records the clip box on the shading', async () => {
  const document = await PDFDocument.create()
  const shading = document.context.obj({ ShadingType: 1 }) as PDFDict
  const bounds: PaintedBounds = new WeakMap()
  const shadingBounds: PaintedBounds = new WeakMap()
  recordPatternPaintedBounds(
    bytes('0 0 10 10 re W n /S1 sh'),
    () => undefined,
    bounds,
    () => undefined,
    (name) => (name === 'S1' ? shading : undefined),
    shadingBounds,
  )
  expect(shadingBounds.get(shading)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 })
})

test('sh without a clip marks the shading unbounded', async () => {
  const document = await PDFDocument.create()
  const shading = document.context.obj({ ShadingType: 1 }) as PDFDict
  const shadingBounds: PaintedBounds = new WeakMap()
  recordPatternPaintedBounds(
    bytes('/S1 sh'),
    () => undefined,
    new WeakMap(),
    () => undefined,
    (name) => (name === 'S1' ? shading : undefined),
    shadingBounds,
  )
  expect(shadingBounds.get(shading)).toBe('unbounded')
})
