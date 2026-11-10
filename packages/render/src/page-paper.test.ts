import { describe, expect, test } from 'bun:test'
import { MM_PER_PT, Print, printBoxes } from '@segnavia/format'
import { PDFDocument, PDFName } from 'pdf-lib'
import { RenderOversetError, RenderRefusedError } from './errors.ts'
import { addPressBoxes, assertPrintOptions, oversetRefusal, pressContentPlacement, printCss } from './page-paper.ts'
import { firstStroke, pageContent } from './pdf-content.test-helper.ts'
import { pt } from './pdf-geometry.ts'
import { setPdfPageSize } from './pdf-page-size.ts'

describe('printed page setup', () => {
  test('safe area alone adds only the print custom properties', () => {
    const print = Print.parse({ paper: 'a4', safe: 5 })
    expect(printCss(print, 'ltr')).toBe(':root{--segnavia-bleed:0mm;--segnavia-safe:5mm}')
  })

  test('bleed grows the viewport and becomes physical root padding with the margins', () => {
    const print = Print.parse({
      paper: { width: 148, height: 105, unit: 'mm' },
      orientation: 'landscape',
      margin: { blockStart: 1, blockEnd: 3, inlineStart: 4, inlineEnd: 2 },
      bleed: 3,
    })
    expect(printCss(print, 'ltr')).toBe(
      ':root{--segnavia-bleed:3mm;--segnavia-safe:0mm}:where(html){box-sizing:border-box!important;position:relative!important;width:154mm!important;height:111mm!important;overflow:clip!important;padding:4mm 5mm 6mm 7mm}:where(body){position:absolute!important;inset:4mm 5mm 6mm 7mm!important;width:auto!important;height:auto!important;margin:0!important}',
    )
  })

  test('mirrors a binding-relative press margin for right-to-left text', () => {
    const print = Print.parse({
      paper: { width: 148, height: 105, unit: 'mm' },
      orientation: 'landscape',
      margin: { blockStart: 1, blockEnd: 3, inlineStart: 4, inlineEnd: 2 },
      bleed: 3,
    })
    expect(printCss(print, 'rtl')).toContain('padding:4mm 7mm 6mm 5mm')
  })

  test('a CSS page size is refused for bleed or marks', () => {
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4', marks: true }), true)).toThrow(RenderRefusedError)
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4', marks: true }), true)).toThrow('Remove preferCssPageSize, or remove the bleed and marks')
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4' }), true)).not.toThrow()
  })

  test('a press page refuses only when Chromium prints it onto multiple papers', () => {
    expect(oversetRefusal(3, 1)).toBeUndefined()
    expect(oversetRefusal(3, 2)).toBeInstanceOf(RenderOversetError)
    expect(oversetRefusal(3, 2)).toMatchObject({ page: 3, papers: 2 })
  })

  test('the Chromium page keeps its top edge when its rounded height differs from the bleed box', () => {
    const bleedBox = { x: 17, y: 17, width: 612, height: 858.9 }
    const placement = pressContentPlacement({ width: 612, height: 859.9 }, bleedBox)
    expect(placement).toEqual({ x: 17, y: 16, width: 612, height: 859.9 })
    expect(placement.y + placement.height).toBe(bleedBox.y + bleedBox.height)
  })

  test('a Chromium-sized press page 0.7 pt taller is corrected to the bleed box', async () => {
    const print = Print.parse({ paper: { width: 100, height: 100, unit: 'mm' }, bleed: 3 })
    const { bleedBox } = printBoxes(print)
    const width = Number(pt(bleedBox.width).toFixed(12))
    const height = Number(pt(bleedBox.height).toFixed(12))
    const snapped = await PDFDocument.create()
    snapped.addPage([width, height + 0.7]).drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
    const corrected = await PDFDocument.load(await setPdfPageSize(await snapped.save(), bleedBox))
    expect(corrected.getPage(0).getMediaBox()).toEqual({ x: 0, y: 0, width, height })
  })
})

async function bleedSource(print: Print): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const { bleedBox } = printBoxes(print)
  const page = document.addPage([pt(bleedBox.width), pt(bleedBox.height)])
  page.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
  return document.save()
}

test('a single page with registration marks stores Separation All and strokes with it', async () => {
  const print = Print.parse({ paper: { width: 100, height: 100, unit: 'mm' }, marks: true, markColor: 'registration' })
  const bytes = await addPressBoxes(await bleedSource(print), printBoxes(print), print.markColor)
  const text = await pageContent(bytes)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
  const output = await PDFDocument.load(bytes)
  expect(output.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'))?.toString()).toContain('/Separation')
})

test('a single page with marks draws a crop mark at the mapped endpoints', async () => {
  const print = Print.parse({ paper: { width: 100, height: 100, unit: 'mm' }, marks: true })
  const bytes = await addPressBoxes(await bleedSource(print), printBoxes(print), print.markColor)
  const boxes = printBoxes(print)
  const mark = boxes.marks[0]
  if (!mark) throw new Error('the print fixture has no crop mark')
  const stroke = firstStroke(await pageContent(bytes))
  expect(stroke.start.x).toBeCloseTo(mark.x1 / MM_PER_PT, 5)
  expect(stroke.start.y).toBeCloseTo((boxes.media.height - mark.y1) / MM_PER_PT, 5)
  expect(stroke.end.x).toBeCloseTo(mark.x2 / MM_PER_PT, 5)
  expect(stroke.end.y).toBeCloseTo((boxes.media.height - mark.y2) / MM_PER_PT, 5)
})

test('press boxes are applied to every page', async () => {
  const print = Print.parse({ paper: { width: 100, height: 100, unit: 'mm' }, bleed: 3, marks: true })
  const source = await PDFDocument.create()
  for (let index = 0; index < 3; index++) source.addPage([pt(106), pt(106)]).drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
  const output = await PDFDocument.load(await addPressBoxes(await source.save(), printBoxes(print)))
  expect(output.getPageCount()).toBe(3)
  for (const page of output.getPages()) {
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(true)
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(true)
    expect(page.getBleedBox()).toEqual({ x: pt(6), y: pt(6), width: pt(106), height: pt(106) })
    expect(page.getTrimBox()).toEqual({ x: pt(9), y: pt(9), width: pt(100), height: pt(100) })
  }
})
