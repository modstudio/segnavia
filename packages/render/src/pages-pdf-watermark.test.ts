import { expect, test } from 'bun:test'
import { Page as PageSchema, PX_PER_MM } from '@segnavia/format'
import { prepareSlots, printedPageAuthorHtml, resolvePageHtml } from '@segnavia/html'
import { PDFDocument, PDFName } from 'pdf-lib'
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

async function pdfPages(count: number, width: number, height: number): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  for (let index = 0; index < count; index++) document.addPage([width, height]).drawText('page')
  return document.save()
}

async function markedPdf(mark: string): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([100, 100])
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(mark)))
  return document.save()
}

async function cssPiece(pixels: number, height = pixels): Promise<Uint8Array> {
  return pdfPage(pt(pixels / PX_PER_MM), pt(height / PX_PER_MM))
}

test('unimposed pages are watermarked before their marked bytes are joined and finished', async () => {
  const pages = [
    Page.parse({ html: '<p>First</p>', size: { width: 100, height: 100 } }),
    Page.parse({ html: '<p>Second</p>', size: { width: 100, height: 100 } }),
  ]
  let watermarkedPages: unknown[] = []
  let finished = false

  await renderPagesPdf(
    pages,
    preparedSlots,
    {},
    {
      pagePdf: async () => ({ bytes: await pdfPage(100, 100) }),
      piecePdf: async () => ({ bytes: new Uint8Array() }),
      fontFaces: () => '',
      watermark: async (parts) => {
        watermarkedPages = parts.map((part) => part.page)
        return [await markedPdf('marked-first'), await markedPdf('marked-second')]
      },
      finish: async (pdf) => {
        expect(await pageContent(pdf, 0)).toBe('marked-first')
        expect(await pageContent(pdf, 1)).toBe('marked-second')
        finished = true
        return pdf
      },
    },
  )

  expect(watermarkedPages).toEqual(pages)
  expect(finished).toBe(true)
})

test('mixed identity imposition numbers every page in a sectioned printed part', async () => {
  const printed = Page.parse({
    html: '<p>Printed</p>',
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
  })
  const plain = Page.parse({ html: '<p>Plain</p>', size: 'fluid' })
  const imposition = { paper: 'letter' as const, columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } }
  const render = async (pages: 'all' | number[]) =>
    renderPagesPdf(
      [printed, plain],
      preparedSlots,
      { imposition },
      {
        pagePdf: async () => ({ bytes: await pdfPages(2, 612, 792) }),
        piecePdf: async () => ({ bytes: await pdfPage(612, 792) }),
        fontFaces: () => '',
        finish: async (pdf) => pdf,
        watermark: async (parts, count) => {
          expect(count).toBeUndefined()
          let nextPhysicalPage = 1
          const selected: Array<{ part: number; page: number }> = []
          for (const [partIndex, part] of parts.entries()) {
            const pageCount = (await PDFDocument.load(part.bytes)).getPageCount()
            const physicalPages = part.physicalPages ?? Array.from({ length: pageCount }, () => nextPhysicalPage++)
            for (let page = 1; page <= pageCount; page++) {
              if (pages === 'all' || pages.includes(physicalPages[page - 1] as number)) selected.push({ part: partIndex, page })
            }
          }
          const layer = await PDFDocument.create()
          for (const _page of selected) layer.addPage([100, 100]).drawText('mark')
          return stampWatermarkParts(
            parts.map((part) => part.bytes),
            await layer.save(),
            selected,
          )
        },
      },
    )
  const selected = await render([3])
  expect(await pageContent(selected, 0)).not.toContain('/Artifact')
  expect(await pageContent(selected, 1)).not.toContain('/Artifact')
  expect(await pageContent(selected, 2)).toContain('/Artifact')
  const all = await render('all')
  for (const index of [0, 1, 2]) expect((await pageContent(all, index)).match(/\/Artifact/g)).toHaveLength(1)
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
        seen = parts.map((part) => {
          if (!part.page) throw new Error('An imposed page watermark part needs its source page.')
          return { source: printedPageAuthorHtml(part.page), physical: part.physicalPages }
        })
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
