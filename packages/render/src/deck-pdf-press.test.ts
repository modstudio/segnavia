import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { PDFDocument, PDFName } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { renderDeckPdf } from './deck-pdf.ts'
import { firstStroke, pageContent } from './pdf-content.test-helper.ts'
import { pt } from './pdf-geometry.ts'

const deck = Deck.parse({
  title: 'Deck',
  size: { width: 400, height: 200 },
  slides: [
    { id: 'html-slide', content: { kind: 'html', html: '<p>HTML</p>' } },
    { id: 'image-slide', content: { kind: 'image', src: 'image.png', alt: 'Image' } },
  ],
})
const pressedDeck = Deck.parse({ ...deck, print: { bleed: 3, marks: true } })
const bleedDeck = Deck.parse({ ...deck, print: { bleed: 3 } })

async function requestedPdf(html: string, pdf: Parameters<Tab['pdf']>[0]): Promise<Uint8Array> {
  const millimeters = (value: string | number | undefined, fallback: number) =>
    typeof value === 'string' && value.endsWith('mm') ? (Number.parseFloat(value) * 72) / 25.4 : fallback
  const width = millimeters(pdf?.width, 300)
  const height = millimeters(pdf?.height, 150)
  const output = await PDFDocument.create()
  const pages = html.includes('<section class="sheet') ? 2 : 1
  for (let index = 0; index < pages; index++) output.addPage([width, height]).drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
  return output.save()
}

const services = {
  renderPdf: async (setup: { html: string }, pdf: Parameters<Tab['pdf']>[0]) => requestedPdf(setup.html, pdf),
  fontFaces: () => '',
  finish: async (pdf: Uint8Array) => pdf,
}

test('deck sheet bleed writes press boxes on every slide at the 96 dpi trim', async () => {
  const pages = (await PDFDocument.load(await renderDeckPdf(bleedDeck, {}, services))).getPages()
  expect(pages).toHaveLength(2)
  for (const page of pages) {
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(true)
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(true)
    expect(page.getBleedBox()).toEqual(page.getMediaBox())
    const trim = page.getTrimBox()
    expect(trim.x).toBeCloseTo(pt(3), 1)
    expect(trim.y).toBeCloseTo(pt(3), 1)
    expect(trim.width).toBe(300)
    expect(trim.height).toBe(150)
  }
})

test('deck crop marks are drawn on every slide sheet', async () => {
  const bytes = await renderDeckPdf(pressedDeck, {}, services)
  const pages = (await PDFDocument.load(bytes)).getPages()
  expect(pages).toHaveLength(2)
  for (let index = 0; index < pages.length; index++) {
    expect(firstStroke(await pageContent(bytes, index))).toBeDefined()
  }
})

test('plain deck sheets have no press boxes', async () => {
  for (const page of (await PDFDocument.load(await renderDeckPdf(deck, {}, services))).getPages()) {
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(false)
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(false)
    expect(page.node.has(PDFName.of('ArtBox'))).toBe(false)
  }
})

test('deck print writes press boxes on every notes sheet', async () => {
  const pages = (await PDFDocument.load(await renderDeckPdf(pressedDeck, { layout: 'notes', notesPaper: { paper: 'letter' } }, services))).getPages()
  expect(pages).toHaveLength(2)
  for (const page of pages) {
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(true)
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(true)
  }
})

test('deck press settings refuse removed and incompatible options before rendering', async () => {
  await expect(renderDeckPdf(deck, { sheet: { bleed: 3 } } as never, services)).rejects.toThrow("deck Document's print")
  await expect(renderDeckPdf(pressedDeck, { preferCssPageSize: true }, services)).rejects.toThrow('Remove preferCssPageSize')
})

test('notesPaper refuses press fields in favor of the deck Document', async () => {
  await expect(renderDeckPdf(deck, { layout: 'notes', notesPaper: { paper: 'letter', bleed: -1 } } as never, services)).rejects.toThrow("deck Document's print")
})
