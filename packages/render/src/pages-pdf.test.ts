import { expect, test } from 'bun:test'
import { Page, PX_PER_MM, sheetMm } from '@segnavia/format'
import { PDFDocument } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import { pt } from './pdf-geometry.ts'

async function cssPiece(pixels: number): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const size = pt(pixels / PX_PER_MM)
  document.addPage([size, size]).drawText('Card')
  return document.save()
}

function drawScale(content: string): { x: number; y: number } {
  const match = [...content.matchAll(/([+-]?(?:\d+\.?\d*|\.\d+)) 0 0 ([+-]?(?:\d+\.?\d*|\.\d+)) [+-]?(?:\d+\.?\d*|\.\d+) [+-]?(?:\d+\.?\d*|\.\d+) cm/g)].at(-1)
  if (!match) throw new Error(`no placement transform in: ${content}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}

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
      piecePdf: async () => cssPiece(100),
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
      piecePdf: async () => cssPiece(80),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const text = await pageContent(bytes)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
})

test('an imposed fluid letter piece whose printed page was snapped is drawn at scale 1', async () => {
  const letter = sheetMm({ paper: 'letter', orientation: 'portrait' })
  const page = Page.parse({ html: '<p>Letter</p>', size: 'fluid' })
  const snapped = await PDFDocument.create()
  snapped.addPage([pt(letter.width), pt(letter.height) + 0.7]).drawRectangle({ x: 0, y: 0, width: 10, height: 10 })
  const bytes = await renderPagesPdf(
    [page],
    {
      imposition: {
        paper: 'letter',
        columns: 1,
        rows: 1,
        cell: { width: letter.width, height: letter.height },
      },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => snapped.save(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const scale = drawScale(await pageContent(bytes))
  expect(scale.x).toBe(1)
  expect(scale.y).toBe(1)
})
