import { describe, expect, test } from 'bun:test'
import { MM_PER_PT, Print, printBoxes } from '@segnavia/format'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { addPressBoxes, assertPrintOptions, pressContentPlacement, printCss, printViewport } from './page-paper.ts'
import { pt } from './pdf-geometry.ts'

describe('printed page setup', () => {
  test('safe area alone adds only the print custom properties', () => {
    const print = Print.parse({ paper: 'a4', safe: 5 })
    expect(printCss(print)).toBe(':root{--segnavia-bleed:0mm;--segnavia-safe:5mm}')
    expect(printViewport(print)).toEqual({ width: 794, height: 1123 })
  })

  test('bleed grows the viewport and becomes physical root padding with the margins', () => {
    const print = Print.parse({
      paper: { width: 148, height: 105, unit: 'mm' },
      orientation: 'landscape',
      margin: { top: 1, right: 2, bottom: 3, left: 4 },
      bleed: 3,
    })
    expect(printCss(print)).toBe(
      ':root{--segnavia-bleed:3mm;--segnavia-safe:0mm}:where(html){box-sizing:border-box!important;position:relative!important;width:154mm!important;height:111mm!important;overflow:clip!important;padding:4mm 5mm 6mm 7mm}:where(body){position:absolute!important;inset:4mm 5mm 6mm 7mm!important;width:auto!important;height:auto!important}',
    )
    expect(printViewport(print)).toEqual({ width: 583, height: 420 })
  })

  test('a CSS page size is refused for bleed or marks', () => {
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4', marks: true }), true)).toThrow(RenderRefusedError)
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4', marks: true }), true)).toThrow('Remove preferCssPageSize, or remove the bleed and marks')
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4' }), true)).not.toThrow()
  })

  test('the Chromium page keeps its top edge when its rounded height differs from the bleed box', () => {
    const bleedBox = { x: 17, y: 17, width: 612, height: 858.9 }
    const placement = pressContentPlacement({ width: 612, height: 859.9 }, bleedBox)
    expect(placement).toEqual({ x: 17, y: 16, width: 612, height: 859.9 })
    expect(placement.y + placement.height).toBe(bleedBox.y + bleedBox.height)
  })
})

async function pageContent(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return streams
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n')
}

async function bleedSource(print: Print): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const { bleedBox } = printBoxes(print)
  const page = document.addPage([pt(bleedBox.width), pt(bleedBox.height)])
  page.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
  return document.save()
}

test('a single page with registration marks stores Separation All and strokes with it', async () => {
  const print = Print.parse({ paper: { width: 100, height: 100, unit: 'mm' }, marks: true, markColor: 'registration' })
  const bytes = await addPressBoxes(await bleedSource(print), print)
  const text = await pageContent(bytes)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
  const output = await PDFDocument.load(bytes)
  expect(output.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'))?.toString()).toContain('/Separation')
})

function firstStroke(text: string): { end: { x: number; y: number }; start: { x: number; y: number } } {
  const match = /([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+m\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+l/.exec(text)
  if (!match) throw new Error(`no stroke path in: ${text}`)
  return { start: { x: Number(match[1]), y: Number(match[2]) }, end: { x: Number(match[3]), y: Number(match[4]) } }
}

test('a single page with marks draws a crop mark at the mapped endpoints', async () => {
  const print = Print.parse({ paper: { width: 100, height: 100, unit: 'mm' }, marks: true })
  const bytes = await addPressBoxes(await bleedSource(print), print)
  const boxes = printBoxes(print)
  const mark = boxes.marks[0]
  if (!mark) throw new Error('the print fixture has no crop mark')
  const stroke = firstStroke(await pageContent(bytes))
  expect(stroke.start.x).toBeCloseTo(mark.x1 / MM_PER_PT, 5)
  expect(stroke.start.y).toBeCloseTo((boxes.media.height - mark.y1) / MM_PER_PT, 5)
  expect(stroke.end.x).toBeCloseTo(mark.x2 / MM_PER_PT, 5)
  expect(stroke.end.y).toBeCloseTo((boxes.media.height - mark.y2) / MM_PER_PT, 5)
})
