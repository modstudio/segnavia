import { expect, test } from 'bun:test'
import { Deck, Imposition, impositionBoxes, Page as PageSchema, PX_PER_MM } from '@segnavia/format'
import { prepareSlots, resolvePageHtml } from '@segnavia/html'
import { PDFDocument, PDFName } from 'pdf-lib'
import { renderDeckPdf } from './deck-pdf.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { finishPdf } from './pdf-finish.ts'
import { pdfBox, pt } from './pdf-geometry.ts'

const Page = { parse: (input: unknown) => resolvePageHtml(PageSchema.parse(input)) }
const preparedSlots = await prepareSlots(undefined)

async function onePage(width: number, height: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.addPage([width, height]).drawRectangle({ x: 0, y: 0, width, height })
  return pdf.save()
}

async function cssPiece(pixels: number): Promise<Uint8Array> {
  return onePage(pt(pixels / PX_PER_MM), pt(pixels / PX_PER_MM))
}

function expectBox(actual: { x: number; y: number; width: number; height: number }, expected: { x: number; y: number; width: number; height: number }): void {
  for (const field of ['x', 'y', 'width', 'height'] as const) expect(actual[field]).toBeCloseTo(expected[field], 10)
}

function expectPageBoxes(
  page: ReturnType<PDFDocument['getPage']>,
  expected: ReturnType<typeof impositionBoxes>[number],
  media: { width: number; height: number },
): void {
  expect(page.node.has(PDFName.of('TrimBox'))).toBe(true)
  expect(page.node.has(PDFName.of('BleedBox'))).toBe(true)
  expect(page.node.has(PDFName.of('CropBox'))).toBe(false)
  const trim = page.getTrimBox()
  const bleed = page.getBleedBox()
  const mediaBox = page.getMediaBox()
  expectBox(trim, pdfBox(expected.trim, media.height))
  expectBox(bleed, pdfBox(expected.bleedBox, media.height))
  expectBox(mediaBox, { x: 0, y: 0, width: pt(media.width), height: pt(media.height) })
  expect(trim.x).toBeGreaterThanOrEqual(bleed.x)
  expect(trim.y).toBeGreaterThanOrEqual(bleed.y)
  expect(trim.x + trim.width).toBeLessThanOrEqual(bleed.x + bleed.width)
  expect(trim.y + trim.height).toBeLessThanOrEqual(bleed.y + bleed.height)
  expect(bleed.x).toBeGreaterThanOrEqual(mediaBox.x)
  expect(bleed.y).toBeGreaterThanOrEqual(mediaBox.y)
  expect(bleed.x + bleed.width).toBeLessThanOrEqual(mediaBox.x + mediaBox.width)
  expect(bleed.y + bleed.height).toBeLessThanOrEqual(mediaBox.y + mediaBox.height)
}

test('an imposed deck keeps both sides grid trim and bleed boxes through final output', async () => {
  const input = {
    paper: { width: 120, height: 80, unit: 'mm' as const },
    orientation: 'landscape' as const,
    columns: 2,
    rows: 1,
    cell: { width: 40, height: 60 },
    margin: { top: 7, right: 15, bottom: 13, left: 15 },
    gap: { column: 10, row: 0 },
    sides: 'two' as const,
  }
  const press = { bleed: 3 }
  const deck = Deck.parse({
    title: 'Deck',
    size: { width: 400, height: 200 },
    print: press,
    slides: [
      { id: 'front', content: { kind: 'html', html: '<p>Front</p>' } },
      { id: 'back', content: { kind: 'html', html: '<p>Back</p>' } },
    ],
  })
  const bytes = await renderDeckPdf(deck, { imposition: input }, { renderPdf: async () => onePage(400, 200), fontFaces: () => '', finish: finishPdf })
  const output = await PDFDocument.load(bytes)
  const parsed = Imposition.parse(input)
  const boxes = impositionBoxes(parsed, press)
  expect(output.getPages()).toHaveLength(2)
  for (const [index, page] of output.getPages().entries()) {
    const expected = boxes[index]
    if (!expected) throw new Error(`the imposition has no boxes for page ${index}`)
    expectPageBoxes(page, expected, { width: 120, height: 80 })
  }
})

test('imposed pages keep equal no-bleed grid boxes through final output', async () => {
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 80, height: 80 } })
  const input = {
    paper: { width: 100, height: 80, unit: 'mm' as const },
    orientation: 'landscape' as const,
    columns: 2,
    rows: 1,
    cell: { width: 30, height: 40 },
    margin: { top: 20, right: 12, bottom: 20, left: 7 },
    gap: { column: 8, row: 0 },
  }
  const bytes = await renderPagesPdf(
    [page],
    preparedSlots,
    { imposition: input },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => cssPiece(80),
      fontFaces: () => '',
      finish: finishPdf,
    },
  )
  const output = await PDFDocument.load(bytes)
  const expected = impositionBoxes(Imposition.parse(input))[0]
  if (!expected) throw new Error('the imposition has no front-side boxes')
  expect(output.getPages()).toHaveLength(1)
  for (const sheet of output.getPages()) {
    expectPageBoxes(sheet, expected, { width: 100, height: 80 })
    expectBox(sheet.getBleedBox(), sheet.getTrimBox())
  }
})
