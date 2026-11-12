import { expect, test } from 'bun:test'
import { Page as PageSchema, PX_PER_MM } from '@segnavia/format'
import { prepareSlots, printedPageAuthorHtml, resolvePageHtml } from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import { renderPagesPdf } from './pages-pdf.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import { pt } from './pdf-geometry.ts'
import { stampWatermarkParts } from './watermark-stamp.ts'

const Page = { parse: (input: unknown) => resolvePageHtml(PageSchema.parse(input)) }
const preparedSlots = await prepareSlots(undefined)

async function pdfPage(width: number, height: number): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.addPage([width, height]).drawText('page')
  return document.save()
}

async function cssPiece(pixels: number, height = pixels): Promise<Uint8Array> {
  return pdfPage(pt(pixels / PX_PER_MM), pt(height / PX_PER_MM))
}

test('mixed identity imposition stamps each reader page exactly once', async () => {
  const plain = Page.parse({ html: '<p>Plain</p>', size: 'fluid' })
  const printed = Page.parse({
    html: '<p>Printed</p>',
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
  })
  const imposition = { paper: 'letter' as const, columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } }
  const render = async (pages: 'all' | number[]) =>
    renderPagesPdf(
      [plain, printed],
      preparedSlots,
      { imposition },
      {
        pagePdf: async (_page, _slots, _options, index) => ({ bytes: await cssPiece(100 + index) }),
        piecePdf: async () => ({ bytes: await pdfPage(612, 792) }),
        fontFaces: () => '',
        finish: async (pdf) => pdf,
        watermark: async (parts, count) => {
          const selected = pages === 'all' ? parts : parts.filter((part) => pages.includes(part.physicalPages?.[0] ?? 0))
          const layer = await PDFDocument.create()
          for (const _part of selected) layer.addPage([100, 100]).drawText('mark')
          expect(count).toBe(2)
          return stampWatermarkParts(
            parts.map((part) => part.bytes),
            await layer.save(),
            selected.map((part) => ({ part: parts.indexOf(part), page: 1 })),
          )
        },
      },
    )
  const selected = await render([2])
  expect(await pageContent(selected, 0)).not.toContain('/Artifact')
  expect(await pageContent(selected, 1)).toContain('/Artifact')
  const all = await render('all')
  for (const index of [0, 1]) expect((await pageContent(all, index)).match(/\/Artifact/g)).toHaveLength(1)
})

test('imposed watermark parts identify their reader pages even when placements are reversed', async () => {
  const pages = Array.from({ length: 4 }, (_, index) => Page.parse({ html: `<p>${index + 1}</p>`, size: { width: 80, height: 80 } }))
  let seen: Array<{ source: string; physical: readonly number[] | undefined }> = []
  let pageCount = 0
  await renderPagesPdf(
    pages,
    preparedSlots,
    {
      imposition: {
        paper: { width: 200, height: 100, unit: 'mm' },
        orientation: 'landscape',
        columns: 2,
        rows: 1,
        cell: { width: 80, height: 80 },
        sides: 'two',
      },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => ({ bytes: await cssPiece(80) }),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
      watermark: async (parts, count) => {
        seen = parts.map((part) => ({ source: printedPageAuthorHtml(part.page), physical: part.physicalPages }))
        pageCount = count ?? 0
        return parts.map((part) => part.bytes)
      },
    },
  )
  expect(pageCount).toBe(4)
  expect(seen.map((part) => part.physical?.[0])).not.toEqual([1, 2, 3, 4])
  for (const part of seen) expect(part.physical).toEqual([Number(part.source.match(/<p>(\d)<\/p>/)?.[1])])
})

test('an inset imposed piece declares its trim inside three millimeters of bleed', async () => {
  const page = Page.parse({ html: '<p>Bleed</p>', size: 'fluid', print: { paper: { width: 100, height: 150, unit: 'mm' }, bleed: 3 } })
  let media = { width: 0, height: 0 }
  let trim = { x: 0, y: 0, width: 0, height: 0 }
  await renderPagesPdf(
    [page],
    preparedSlots,
    {
      imposition: {
        paper: { width: 120, height: 170, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 100, height: 150 },
        margin: { top: 10, right: 10, bottom: 10, left: 10 },
      },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async (_page, _slots, geometry) => ({ bytes: await cssPiece(geometry.viewport.width, geometry.viewport.height) }),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
      watermark: async (parts) => {
        const output = (await PDFDocument.load(parts[0]?.bytes as Uint8Array)).getPage(0)
        media = output.getMediaBox()
        trim = output.getTrimBox()
        return parts.map((part) => part.bytes)
      },
    },
  )
  expect(trim.x).toBeCloseTo(pt(3), 5)
  expect(trim.y).toBeCloseTo(pt(3), 5)
  expect(trim.width).toBeCloseTo(media.width - pt(6), 5)
  expect(trim.height).toBeCloseTo(media.height - pt(6), 5)
})
