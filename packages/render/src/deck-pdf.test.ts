import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { PDFDocument } from 'pdf-lib'
import { renderDeckPdf } from './deck-pdf.ts'

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
