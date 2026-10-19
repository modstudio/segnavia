import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { embedOnePage } from './pdf-compose.ts'
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
