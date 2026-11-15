import { expect, test } from 'bun:test'
import { PLACED_PDF_SOURCES } from '@segnavia/html'
import { degrees, PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts } from 'pdf-lib'
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
  expect(await pageContent(output)).toMatch(/\/Artifact BMC[\s\S]*75 147 135 66 re[\s\S]*\/EmbeddedPdfPage/)
  const text = new TextDecoder().decode(output)
  expect(text).toContain('/Subtype /Form')
  expect(text).not.toContain('/Subtype /Image')
  expect(text).not.toContain('other-page')
})

async function transformedPageOutput(rotate: 0 | 90, userUnit: number): Promise<string> {
  const source = await PDFDocument.create()
  const page = source.addPage([200, 100])
  page.setRotation(degrees(rotate))
  page.node.set(PDFName.of('UserUnit'), PDFNumber.of(userUnit))
  page.drawText('transformed')
  const target = await PDFDocument.create()
  target.addPage([600, 800])
  const output = await drawPlacedPdfPages(
    await target.save(),
    [{ address: 'source', page: 1, paper: 0, draw: { x: 96, y: 192, width: 192, height: 96 }, clip: { x: 96, y: 192, width: 192, height: 96 } }],
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
                pages: [{ rotate, userUnit, boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }],
              },
            },
          ],
        ]),
      },
    },
  )
  return pageContent(output)
}

test('maps a UserUnit 2 displayed page exactly into the marker rectangle', async () => {
  expect(await transformedPageOutput(0, 2)).toMatch(/72 144 144 72 re[\s\S]*1 0 0 1 72 144 cm[\s\S]*0\.36 0 0 0\.36 0 0 cm/)
})

test('maps a rotated non-square page exactly into the marker rectangle', async () => {
  expect(await transformedPageOutput(90, 1)).toMatch(/72 144 144 72 re[\s\S]*1 0 0 1 72 144 cm[\s\S]*1\.44 0 0 0\.36 0 0 cm/)
})

test('uses and removes Chromium marker annotations for fragmented page placement', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 100]).drawText('placed')
  const target = await PDFDocument.create()
  target.addPage([600, 800])
  const second = target.addPage([600, 800])
  second.node.set(
    PDFName.of('Annots'),
    target.context.obj([
      { Type: 'Annot', Subtype: 'Link', Rect: [72, 144, 216, 216], A: { S: 'URI', URI: PDFString.of('https://placed-pdf.invalid/marker') } },
    ]),
  )
  const output = await drawPlacedPdfPages(
    await target.save(),
    [{ id: 'marker', address: 'source', page: 1, paper: 0, draw: { x: 0, y: 0, width: 1, height: 1 }, clip: { x: 0, y: 0, width: 1, height: 1 } }],
    {
      placements: {
        resolve: async () => undefined,
        [PLACED_PDF_SOURCES]: new Map([
          [
            'source',
            {
              bytes: await source.save(),
              media: { format: 'pdf', size: { width: 200, height: 100 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }] },
            },
          ],
        ]),
      },
    },
  )
  const loaded = await PDFDocument.load(output)
  expect(loaded.getPage(0).node.Annots()).toBeUndefined()
  expect(loaded.getPage(1).node.Annots()?.size() ?? 0).toBe(0)
  expect(await pageContent(output, 0)).not.toContain('/EmbeddedPdfPage')
  expect(await pageContent(output, 1)).toMatch(/72 144 144 72 re[\s\S]*\/EmbeddedPdfPage/)
})
