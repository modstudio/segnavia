import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { PDFDocument, PDFName } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { renderDeckPdf } from './deck-pdf.ts'

const deck = Deck.parse({
  title: 'Deck',
  size: { width: 400, height: 200 },
  slides: [
    { id: 'html-slide', content: { kind: 'html', html: '<p>HTML</p>' } },
    { id: 'image-slide', content: { kind: 'image', src: 'image.png', alt: 'Image' } },
  ],
})

const imposition = {
  paper: { width: 120, height: 80, unit: 'mm' as const },
  orientation: 'landscape' as const,
  columns: 2,
  rows: 1,
  cell: { width: 40, height: 60 },
  margin: { top: 10, right: 15, bottom: 10, left: 15 },
  gap: { column: 10, row: 0 },
}

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
  const pages = (await PDFDocument.load(await renderDeckPdf(deck, { sheet: { bleed: 3 } }, services))).getPages()
  expect(pages).toHaveLength(2)
  for (const page of pages) {
    expect(page.getBleedBox()).toBeDefined()
    expect(page.getTrimBox()).toMatchObject({ width: 300, height: 150 })
  }
})

test('plain deck sheets have no press boxes', async () => {
  for (const page of (await PDFDocument.load(await renderDeckPdf(deck, {}, services))).getPages()) {
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(false)
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(false)
    expect(page.node.has(PDFName.of('ArtBox'))).toBe(false)
  }
})

test('notesPaper bleed writes press boxes on every notes sheet', async () => {
  const pages = (await PDFDocument.load(await renderDeckPdf(deck, { layout: 'notes', notesPaper: { paper: 'letter', bleed: 3 } }, services))).getPages()
  expect(pages).toHaveLength(2)
  for (const page of pages) {
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(true)
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(true)
  }
})

test('deck press settings refuse incompatible options before rendering', async () => {
  await expect(renderDeckPdf(deck, { sheet: { bleed: 3 }, imposition }, services)).rejects.toThrow('Remove sheet, or remove imposition')
  await expect(renderDeckPdf(deck, { sheet: { bleed: 3 }, layout: 'notes' }, services)).rejects.toThrow('use notesPaper')
  await expect(renderDeckPdf(deck, { sheet: { bleed: 3 }, preferCssPageSize: true }, services)).rejects.toThrow('Remove preferCssPageSize')
})

test('invalid deck press values name the setting and remedy', async () => {
  await expect(renderDeckPdf(deck, { sheet: { bleed: -1 } }, services)).rejects.toThrow('Correct sheet.bleed, or remove sheet')
  await expect(renderDeckPdf(deck, { sheet: { markColor: 'registration' } }, services)).rejects.toThrow('Correct sheet.markColor, or remove sheet')
  await expect(renderDeckPdf(deck, { layout: 'notes', notesPaper: { paper: 'letter', bleed: -1 } }, services)).rejects.toThrow(
    'Correct notesPaper.bleed, or remove notesPaper',
  )
})
