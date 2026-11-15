import { expect, test } from 'bun:test'
import { PLACED_PDF_SOURCES } from '@segnavia/html'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { pageContent } from './pdf-content.test-helper.ts'
import { drawPlacedPdfPages, placedPdfCrop } from './placed-pdf-page.ts'

test('converts physical crop insets independently of document direction', () => {
  const box = { x: 10, y: 20, width: 200, height: 100 }
  expect(placedPdfCrop(box, '10% 20px 30% 40px')).toEqual({ x: 50, y: 50, width: 140, height: 60 })
})

test('draws a bounded source page once as an artifact Form XObject', async () => {
  const source = await PDFDocument.create()
  const first = source.addPage([200, 100])
  first.drawText('placed-vector', { x: 20, y: 40, font: await source.embedFont(StandardFonts.Helvetica) })
  source.addPage([300, 400]).drawText('other-page')
  const target = await PDFDocument.create()
  target.addPage([600, 800])
  const output = await drawPlacedPdfPages(
    await target.save(),
    [
      {
        address: 'source',
        page: 1,
        paper: 0,
        draw: { x: 96, y: 192, width: 192, height: 96 },
        clip: { x: 100, y: 196, width: 180, height: 88 },
      },
    ],
    {
      placements: {
        resolve: async () => undefined,
        [PLACED_PDF_SOURCES]: new Map([
          [
            'source',
            {
              bytes: await source.save(),
              media: {
                format: 'pdf',
                size: { width: 200, height: 100 },
                pages: [{ boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }],
              },
            },
          ],
        ]),
      },
    },
  )
  expect(await pageContent(output)).toMatch(/\/Artifact BDC[\s\S]*75 147 135 66 re[\s\S]*\/EmbeddedPdfPage/)
  const text = new TextDecoder().decode(output)
  expect(text).toContain('/Subtype /Form')
  expect(text).not.toContain('/Subtype /Image')
  expect(text).not.toContain('other-page')
})
