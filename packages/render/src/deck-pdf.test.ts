import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { PDFDocument } from 'pdf-lib'
import { renderDeckPdf } from './deck-pdf.ts'
import { RenderRefusedError } from './errors.ts'

async function onePage(width = 300, height = 150): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.addPage([width, height]).drawRectangle({ x: 0, y: 0, width, height })
  return pdf.save()
}

const deck = Deck.parse({
  title: 'Deck',
  size: { width: 400, height: 200 },
  slides: [
    { id: 'html-slide', content: { kind: 'html', html: '<p>HTML</p>' } },
    { id: 'image-slide', content: { kind: 'image', src: 'image.png', alt: 'Image' } },
  ],
})

test('deck PDF renders HTML slides separately and enforces only the composition', async () => {
  const base = await PDFDocument.create()
  base.addPage([300, 150])
  base.addPage([300, 150])
  const documents: string[] = []
  const limitsSeen: unknown[] = []
  const output = await renderDeckPdf(
    deck,
    { limits: { maxSheets: 2 } },
    {
      renderPdf: async (setup) => {
        documents.push(setup.html)
        return setup.html.includes('<section class="sheet">') ? base.save() : onePage()
      },
      fontFaces: () => '',
      enforce: async (pdf, limits) => {
        limitsSeen.push(limits)
        return pdf
      },
    },
  )
  expect((await PDFDocument.load(output)).getPageCount()).toBe(2)
  expect(documents).toHaveLength(2)
  expect(documents[0]).not.toContain('<iframe')
  expect(limitsSeen).toEqual([{ maxSheets: 2 }])
})

test('a failed HTML slide render names the slide id', async () => {
  const rendering = renderDeckPdf(
    deck,
    {},
    {
      renderPdf: async (setup) => {
        if (!setup.html.includes('<section class="sheet">')) throw new Error('paint failed')
        return onePage()
      },
      fontFaces: () => '',
      enforce: async (pdf) => pdf,
    },
  )
  await expect(rendering).rejects.toThrow('Slide "html-slide" could not be rendered: paint failed')
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

test('an imposed deck renders every slide alone and enforces the composed papers once', async () => {
  const documents: Array<{ html: string; beforeOutput: unknown }> = []
  const limitsSeen: unknown[] = []
  const output = await renderDeckPdf(
    deck,
    { imposition, limits: { maxSheets: 1 }, beforeOutput: async () => {} },
    {
      renderPdf: async (setup) => {
        documents.push({ html: setup.html, beforeOutput: setup.beforeOutput })
        return onePage(400, 200)
      },
      fontFaces: () => '',
      enforce: async (pdf, limits) => {
        limitsSeen.push(limits)
        return pdf
      },
    },
  )
  const pdf = await PDFDocument.load(output)
  expect(pdf.getPageCount()).toBe(1)
  expect(documents).toHaveLength(2)
  expect(documents[0]?.html).toContain('<p>HTML</p>')
  expect(documents[0]?.html).not.toContain('<iframe')
  expect(documents[1]?.html).toContain('<img src="image.png"')
  expect(documents.every(({ beforeOutput }) => beforeOutput === undefined)).toBe(true)
  expect(limitsSeen).toEqual([{ maxSheets: 1 }])
})

test('an imposed repeat deck embeds one rendered slide across each paper', async () => {
  const single: Deck = { ...deck, slides: [deck.slides[0] as (typeof deck.slides)[number]] }
  let renders = 0
  const output = await renderDeckPdf(
    single,
    { imposition: { ...imposition, fill: 'repeat' } },
    {
      renderPdf: async () => {
        renders++
        return onePage(400, 200)
      },
      fontFaces: () => '',
      enforce: async (pdf) => pdf,
    },
  )
  expect(renders).toBe(1)
  expect((await PDFDocument.load(output)).getPageCount()).toBe(1)
})

test('a two-sided imposed deck emits front and back PDF pages for one physical paper', async () => {
  const output = await renderDeckPdf(
    deck,
    { imposition: { ...imposition, sides: 'two' } },
    {
      renderPdf: async () => onePage(400, 200),
      fontFaces: () => '',
      enforce: async (pdf) => pdf,
    },
  )
  expect((await PDFDocument.load(output)).getPageCount()).toBe(2)
})

test('an imposed deck refuses notes before rendering', async () => {
  let renders = 0
  const rendering = renderDeckPdf(
    deck,
    { layout: 'notes', imposition },
    {
      renderPdf: async () => {
        renders++
        return onePage()
      },
      fontFaces: () => '',
      enforce: async (pdf) => pdf,
    },
  )
  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
  await expect(rendering).rejects.toThrow("layout: 'notes' and imposition cannot be combined")
  expect(renders).toBe(0)
})

test('a failed non-HTML slide render names the slide id', async () => {
  const rendering = renderDeckPdf(
    deck,
    { imposition },
    {
      renderPdf: async (setup) => {
        if (setup.html.includes('<img')) throw new Error('image failed')
        return onePage()
      },
      fontFaces: () => '',
      enforce: async (pdf) => pdf,
    },
  )
  await expect(rendering).rejects.toThrow('Slide "image-slide" could not be rendered: image failed')
})
