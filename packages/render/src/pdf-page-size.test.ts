import { expect, test } from 'bun:test'
import { PDFArray, PDFDict, PDFDocument, PDFName, rgb } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import { pagePdfSize, pdfPageSizeCorrection, setPdfPageSize } from './pdf-page-size.ts'

test('expresses physical page dimensions as exact inches for Chromium', () => {
  expect(pagePdfSize({ width: 215.9, height: 279.4 })).toEqual({ width: '8.5in', height: '11in' })
  expect(pagePdfSize({ width: 210, height: 297 })).toEqual({
    width: '8.267716535433072in',
    height: '11.692913385826772in',
  })
  expect(pagePdfSize({ width: 100, height: 150 }, { top: 12.7, right: 25.4, bottom: 38.1, left: 50.8 })).toEqual({
    width: '3.937007874015748in',
    height: '5.905511811023622in',
    margin: { top: '0.5in', right: '1in', bottom: '1.5in', left: '2in' },
  })
})

test.each([
  [
    { x: 0, y: 0, width: 612.96, height: 792.96 },
    { x: 0, y: -0.96 },
  ],
  [
    { x: 0, y: 0, width: 611.04, height: 791.04 },
    { x: 0, y: 0.96 },
  ],
  [
    { x: 2, y: 3, width: 612, height: 792 },
    { x: -2, y: -3 },
  ],
] as const)('corrects printed page geometry while preserving its top edge', (printed, translation) => {
  const correction = pdfPageSizeCorrection(printed, { width: 215.9, height: 279.4 })
  expect(correction.mediaBox).toEqual({ x: 0, y: 0, width: 612, height: 792 })
  expect(correction.translation.x).toBe(translation.x)
  expect(correction.translation.y).toBeCloseTo(translation.y, 10)
})

test('corrects only Chromium paper-size snapping within two points', () => {
  expect(pdfPageSizeCorrection({ x: 0, y: 0, width: 613.9, height: 793.9 }, { width: 215.9, height: 279.4 }).mediaBox).toEqual({
    x: 0,
    y: 0,
    width: 612,
    height: 792,
  })
  expect(() => pdfPageSizeCorrection({ x: 0, y: 0, width: 614.1, height: 794.1 }, { width: 215.9, height: 279.4 })).toThrow(
    new RenderRefusedError(
      'Chromium printed a 614.10 x 794.10 pt page where 612.00 x 792.00 pt was requested. Remove any @page size rule that changes the paper, or set preferCssPageSize, to clear this refusal.',
    ),
  )
})

test('uses a supplied remedy in place of the default clearing step', () => {
  expect(() =>
    pdfPageSizeCorrection(
      { x: 0, y: 0, width: 614.1, height: 794.1 },
      { width: 215.9, height: 279.4 },
      'Remove an @page size rule or the rule that resizes the page to clear this refusal.',
    ),
  ).toThrow(
    new RenderRefusedError(
      'Chromium printed a 614.10 x 794.10 pt page where 612.00 x 792.00 pt was requested. Remove an @page size rule or the rule that resizes the page to clear this refusal.',
    ),
  )
})

test('corrects the page box, content and link annotation together', async () => {
  const input = await PDFDocument.create()
  const page = input.addPage([612.96, 792.96])
  page.setCropBox(0, 0, 612.96, 792.96)
  page.setBleedBox(0, 0, 612.96, 792.96)
  page.setTrimBox(0, 0, 612.96, 792.96)
  page.setArtBox(0, 0, 612.96, 792.96)
  page.drawRectangle({ x: 10, y: 780, width: 20, height: 5, color: rgb(0, 0, 0) })
  const annotation = input.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [10, 780, 30, 785],
    QuadPoints: [10, 785, 30, 785, 10, 780, 30, 780],
  })
  page.node.set(PDFName.of('Annots'), input.context.obj([annotation]))

  const bytes = await setPdfPageSize(await input.save(), { width: 215.9, height: 279.4 })
  const output = await PDFDocument.load(bytes)
  const corrected = output.getPage(0)
  expect(corrected.getMediaBox()).toEqual({ x: 0, y: 0, width: 612, height: 792 })
  expect(corrected.getCropBox()).toEqual({ x: 0, y: 0, width: 612, height: 792 })
  expect(['BleedBox', 'TrimBox', 'ArtBox'].every((name) => !corrected.node.has(PDFName.of(name)))).toBe(true)
  expect(await pageContent(bytes)).toMatch(/1 0 0 1 0 -0\.96\d* cm/)
  const link = corrected.node.Annots()?.lookup(0, PDFDict)
  const rectangle = link
    ?.lookup(PDFName.of('Rect'), PDFArray)
    .asArray()
    .map((value) => Number(value.toString()))
  const quadrilateral = link
    ?.lookup(PDFName.of('QuadPoints'), PDFArray)
    .asArray()
    .map((value) => Number(value.toString()))
  expect(rectangle?.every((value, index) => Math.abs(value - ([10, 779.04, 30, 784.04][index] ?? Number.NaN)) < 1e-10)).toBe(true)
  expect(quadrilateral?.every((value, index) => Math.abs(value - ([10, 784.04, 30, 784.04, 10, 779.04, 30, 779.04][index] ?? Number.NaN)) < 1e-10)).toBe(true)
})
