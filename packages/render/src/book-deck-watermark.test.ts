import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { parseBookFixture } from '@segnavia/html'
import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { renderBookPdf } from './book-pdf.ts'
import type { BookPdfAdapter } from './book-pdf-types.ts'
import { renderDeckPdf } from './deck-pdf.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import { stampWatermark, stampWatermarkParts } from './watermark-stamp.ts'

const day = { date: '2026-11-14', zone: 'UTC', kind: 'current' as const }

async function pages(count: number, width = 400, height = 200): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  for (let index = 0; index < count; index++) document.addPage([width, height]).drawText(`page ${index + 1}`)
  return document.save()
}

async function bookPart(html: string, count: number): Promise<Uint8Array> {
  const document = await PDFDocument.load(await pages(count, 419.53, 595.28))
  const first = document.getPage(0)
  const ids = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1] as string))]
  document.catalog.set(PDFName.of('Dests'), document.context.obj(Object.fromEntries(ids.map((id) => [id, [first.ref, PDFName.of('XYZ'), 0, 595.28, null]]))))
  return document.save()
}

async function watermarkLayer(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.addPage([400, 200]).drawText('watermark')
  return document.save()
}

test('book watermark selection counts front matter as physical pages and runs before finishing', async () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [{ title: 'Preface', html: '<p>Front</p>' }],
    chapters: [{ id: 'body-section', title: 'Body', html: '<p>Body</p>' }],
  })
  let frontPages = 0
  let bodyPages = 0
  let facts: readonly { fontFamily?: string }[] = []
  const adapter: BookPdfAdapter = {
    print: async (html, _book, _slots, _options, part) => {
      const count = part === 'front' ? 1 : part === 'body' ? 2 : frontPages + bodyPages
      if (part === 'front') frontPages = count
      if (part === 'body') bodyPages = count
      return {
        bytes: await bookPart(html, count),
        fontFamily: part === 'front' ? 'Front Face' : 'Body Face',
        overflow: { part, pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
      }
    },
    watermark: async (pdf, pages) => {
      facts = pages
      return stampWatermark(pdf, await watermarkLayer(), [{ layerPage: 0, outputPage: 2 }])
    },
    finish: async (pdf) => {
      expect(await pageContent(pdf, 0)).not.toContain('/Artifact')
      expect(await pageContent(pdf, 1)).toContain('/Artifact')
      expect(await pageContent(pdf, 2)).not.toContain('/Artifact')
      return pdf
    },
  }

  await renderBookPdf(book, { watermark: { text: 'Draft', pages: [2] } }, adapter, day)
  expect(facts.map((page) => page.fontFamily)).toEqual(['Front Face', 'Body Face', 'Body Face'])
})

const deck = Deck.parse({
  title: 'Deck',
  size: { width: 400, height: 200 },
  slides: [
    { id: 'one', content: { kind: 'html', html: '<p>One</p>' }, notes: 'overflowing notes' },
    { id: 'two', content: { kind: 'html', html: '<p>Two</p>' }, notes: 'notes' },
  ],
})

function tabFor(owners: number[], bodyFamily = 'Deck Face', sheetFamily = 'Notes Face'): Tab {
  return {
    locator: (selector: string) => ({
      waitFor: async () => {},
      evaluateAll: async () => (selector === '.sheet' ? owners : []),
    }),
    evaluate: async (value: unknown, capture?: { textRootSelector?: string }) =>
      typeof value === 'string' || (typeof value === 'function' && value.name === 'paginateNotes')
        ? { sheets: owners.length, exceeded: false }
        : {
            fontFamily: capture?.textRootSelector === '.sheet' ? sheetFamily : bodyFamily,
            fontFaceCss: '@font-face{font-family:"Collected Face"}',
          },
  } as unknown as Tab
}

test('overflow notes sheets each take the next physical watermark number', async () => {
  const owners = [0, 0, 1]
  let selectedCount = 0
  const output = await renderDeckPdf(
    deck,
    { layout: 'notes', watermark: { text: 'Draft', pages: [2] } },
    {
      renderPdf: async (setup) => {
        await setup.beforeOutput?.(tabFor(owners))
        return setup.html.includes('data-notes-source') ? pages(3) : pages(1)
      },
      fontFaces: () => '',
      watermark: async (parts, count) => {
        expect(count).toBe(3)
        expect(parts[0]?.pageFacts).toHaveLength(3)
        expect(parts[0]?.pageFacts?.map((facts) => facts.fontFamily)).toEqual(['Notes Face', 'Notes Face', 'Notes Face'])
        expect(parts[0]?.pageFacts?.map((facts) => facts.fontFaceCss)).toEqual([
          '@font-face{font-family:"Collected Face"}',
          '@font-face{font-family:"Collected Face"}',
          '@font-face{font-family:"Collected Face"}',
        ])
        selectedCount++
        return stampWatermarkParts(
          parts.map((part) => part.bytes),
          await watermarkLayer(),
          [{ part: 0, page: 2 }],
        )
      },
      finish: async (pdf) => pdf,
    },
  )
  expect(selectedCount).toBe(1)
  expect(await pageContent(output, 0)).not.toContain('/Artifact')
  expect(await pageContent(output, 1)).toContain('/Artifact')
  expect(await pageContent(output, 2)).not.toContain('/Artifact')
})

test('slides layout keeps each HTML slide font facts and physical page selection matches slide number', async () => {
  let watermarkFacts: readonly { fontFamily?: string }[] = []
  const output = await renderDeckPdf(
    deck,
    { watermark: { text: 'Draft', pages: [2] } },
    {
      renderPdf: async (setup, _pdf, frames) => {
        const family = setup.html.includes('<p>One</p>') ? 'First Face' : setup.html.includes('<p>Two</p>') ? 'Second Face' : 'Printable Face'
        await setup.beforeOutput?.(tabFor([], family))
        return pages(frames.length === 0 ? 2 : 1)
      },
      fontFaces: () => '',
      watermark: async (parts, count) => {
        expect(count).toBe(2)
        watermarkFacts = parts[0]?.pageFacts ?? []
        return stampWatermarkParts(
          parts.map((part) => part.bytes),
          await watermarkLayer(),
          [{ part: 0, page: 2 }],
        )
      },
      finish: async (pdf) => pdf,
    },
  )

  expect(watermarkFacts.map((facts) => facts.fontFamily)).toEqual(['First Face', 'Second Face'])
  expect(await pageContent(output, 0)).not.toContain('/Artifact')
  expect(await pageContent(output, 1)).toContain('/Artifact')
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

test('imposed deck watermark artifact stays in an embedded slide XObject', async () => {
  const output = await renderDeckPdf(
    deck,
    { imposition, watermark: { text: 'Draft', pages: [1] } },
    {
      renderPdf: async (setup) => {
        await setup.beforeOutput?.(tabFor([]))
        return pages(1)
      },
      fontFaces: () => '',
      watermark: async (parts, count) => {
        expect(count).toBe(2)
        expect(parts.map((part) => part.physicalPages)).toEqual([[1], [2]])
        return stampWatermarkParts(
          parts.map((part) => part.bytes),
          await watermarkLayer(),
          [{ part: 0, page: 1 }],
        )
      },
      finish: async (pdf) => pdf,
    },
  )
  expect(await pageContent(output)).not.toContain('/Artifact')
  const document = await PDFDocument.load(output)
  const decoded = [...document.context.enumerateIndirectObjects()]
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
  expect(decoded.some((content) => content.includes('/Artifact'))).toBe(true)
})
