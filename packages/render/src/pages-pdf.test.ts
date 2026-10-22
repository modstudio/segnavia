import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { renderPagesPdf } from './pages-pdf.ts'

test('pagesPdf refuses an empty collection with the action that clears it', async () => {
  const render = renderPagesPdf(
    [],
    {},
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow(new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.'))
})

test('pagesPdf renders the page objects it is given, so their slot preparation is found', async () => {
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 336, height: 192 } })
  const seen: unknown[] = []
  const render = renderPagesPdf(
    [page],
    {},
    {
      pagePdf: async (rendered) => {
        seen.push(rendered)
        throw new Error('stop after the first page')
      },
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow('stop after the first page')
  expect(seen[0]).toBe(page)
})

test('pagesPdf reports marks omitted from a narrow imposition margin without refusing', async () => {
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 100, height: 100 } })
  const reports: unknown[] = []
  const piece = await PDFDocument.create()
  piece.addPage([100, 100]).drawText('Card')
  const bytes = await renderPagesPdf(
    [page],
    {
      imposition: {
        paper: { width: 30, height: 30, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 20, height: 20 },
        margin: { top: 2, right: 5, bottom: 5, left: 5 },
        marks: true,
      },
      marks: { report: (report) => reports.push(report) },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => piece.save(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect(bytes.length).toBeGreaterThan(0)
  expect(reports).toEqual([
    {
      omittedMarks: [
        { side: 'front', edge: 'top', cutPosition: 5 },
        { side: 'front', edge: 'top', cutPosition: 25 },
      ],
    },
  ])
})

test('an imposed pagesPdf with registration marks strokes Separation All', async () => {
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 80, height: 80 } })
  const piece = await PDFDocument.create()
  piece.addPage([80, 80]).drawText('Card')
  const bytes = await renderPagesPdf(
    [page],
    {
      imposition: {
        paper: { width: 40, height: 40, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 20, height: 20 },
        margin: { top: 10, right: 10, bottom: 10, left: 10 },
        marks: true,
        markColor: 'registration',
      },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => piece.save(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  const text = streams
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n')
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
})
