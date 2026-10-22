import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { Imposition, impose, impositionMarks, MM_PER_PT, Page } from '@segnavia/format'
import { PDFDocument, PDFName } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { groupPieces } from './pages-imposition.ts'
import { composeImposedPdf, embedOnePage } from './pdf-compose.ts'
import { firstStroke, pageContent } from './pdf-content.test-helper.ts'
import { MAX_PDF_STREAM_BYTES } from './pdf-load.ts'

function objectStream(contents: Uint8Array): Uint8Array {
  const compressed = deflateSync(contents)
  const prefix = Buffer.from(`%PDF-1.7\n1 0 obj\n<</Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${compressed.length}>>\nstream\n`)
  const suffix = Buffer.from('\nendstream\nendobj\n%%EOF')
  return Buffer.concat([prefix, compressed, suffix])
}

test('refuses an oversized object stream before embedding a page', async () => {
  const output = await PDFDocument.create()
  const pdf = objectStream(new Uint8Array(MAX_PDF_STREAM_BYTES + 1))
  expect(pdf.byteLength).toBeLessThan(32 * 1024)
  await expect(embedOnePage(output, pdf, 'The rendered page')).rejects.toThrow(
    new RenderRefusedError(
      `PDF stream object 1 inflated past the ceiling after ${MAX_PDF_STREAM_BYTES} bytes; the ceiling is ${MAX_PDF_STREAM_BYTES} bytes. Reduce the page content that Chromium packs into one object or cross-reference stream to clear this refusal.`,
    ),
  )
})

async function imposedBytes(markColor: 'black' | 'registration'): Promise<Uint8Array> {
  const imposition = Imposition.parse({
    paper: { width: 40, height: 40, unit: 'mm' },
    columns: 1,
    rows: 1,
    cell: { width: 20, height: 20 },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    marks: true,
    markColor,
  })
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 80, height: 80 } })
  const imposed = impose(imposition, 1)
  const groups = groupPieces([page], imposed, 'contain')
  const piece = await PDFDocument.create()
  piece.addPage([80, 80]).drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
  const pieceBytes = await piece.save()
  return composeImposedPdf(
    imposed,
    groups.map((group) => ({
      key: group.key,
      name: 'piece',
      bytes: pieceBytes,
      placements: group.placements,
    })),
    impositionMarks(imposition),
    markColor,
  )
}

test('an imposed paper with registration marks stores Separation All and strokes with it', async () => {
  const imposition = Imposition.parse({
    paper: { width: 40, height: 40, unit: 'mm' },
    columns: 1,
    rows: 1,
    cell: { width: 20, height: 20 },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    marks: true,
    markColor: 'registration',
  })
  const bytes = await imposedBytes('registration')
  const text = await pageContent(bytes)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
  const output = await PDFDocument.load(bytes)
  expect(output.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'))?.toString()).toContain('/Separation')
  const mark = impositionMarks(imposition)[0]?.marks[0]
  if (!mark) throw new Error('the 1x1 imposition fixture has no crop mark')
  const height = impose(imposition, 1).paper.height
  const stroke = firstStroke(text)
  expect(stroke.start.x).toBeCloseTo(mark.x1 / MM_PER_PT, 5)
  expect(stroke.start.y).toBeCloseTo((height - mark.y1) / MM_PER_PT, 5)
  expect(stroke.end.x).toBeCloseTo(mark.x2 / MM_PER_PT, 5)
  expect(stroke.end.y).toBeCloseTo((height - mark.y2) / MM_PER_PT, 5)
})
