import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { assertPdfStreamsBounded, loadPdf, MAX_PDF_STREAM_BYTES } from './pdf-load.ts'

function objectStream(contents: Uint8Array): Uint8Array {
  const compressed = deflateSync(contents)
  const prefix = Buffer.from(`%PDF-1.7\n1 0 obj\n<</Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${compressed.length}>>\nstream\n`)
  const suffix = Buffer.from('\nendstream\nendobj\n%%EOF')
  return Buffer.concat([prefix, compressed, suffix])
}

test('refuses an object stream before zlib allocates its full inflated size', () => {
  const inflatedSize = MAX_PDF_STREAM_BYTES + 1
  const pdf = objectStream(new Uint8Array(inflatedSize))
  expect(pdf.byteLength).toBeLessThan(32 * 1024)
  expect(() => assertPdfStreamsBounded(pdf)).toThrow(
    new RenderRefusedError(
      `PDF stream object 1 inflated past the ceiling after ${MAX_PDF_STREAM_BYTES} bytes; the ceiling is ${MAX_PDF_STREAM_BYTES} bytes. Reduce the page content that Chromium packs into one object or cross-reference stream to clear this refusal.`,
    ),
  )
})

test('loads a normal generated PDF', async () => {
  const generated = await PDFDocument.create()
  generated.addPage([612, 792])
  const loaded = await loadPdf(await generated.save())
  expect(loaded.getPageCount()).toBe(1)
})
