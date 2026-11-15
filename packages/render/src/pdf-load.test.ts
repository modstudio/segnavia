import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { createPdf, loadPdf, MAX_PDF_STREAM_BYTES } from './pdf-load.ts'

function objectStream(contents: Uint8Array): Uint8Array {
  const compressed = deflateSync(contents)
  const prefix = Buffer.from(`%PDF-1.7\n1 0 obj\n<</Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${compressed.length}>>\nstream\n`)
  const suffix = Buffer.from('\nendstream\nendobj\n%%EOF')
  return Buffer.concat([prefix, compressed, suffix])
}

test('refuses an object stream before zlib allocates its full inflated size', async () => {
  const inflatedSize = MAX_PDF_STREAM_BYTES + 1
  const pdf = objectStream(new Uint8Array(inflatedSize))
  expect(pdf.byteLength).toBeLessThan(32 * 1024)
  await expect(loadPdf(pdf)).rejects.toThrow(
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

test('received input is refused above its byte limit before parsing', async () => {
  await expect(loadPdf(Uint8Array.of(1, 2), { source: 'received', limits: { input: { bytes: 1 } } })).rejects.toThrow('above the limits.input.bytes limit of 1')
})

test('received truncated input has its source-specific unreadable refusal', async () => {
  await expect(loadPdf(new TextEncoder().encode('%PDF-1.7\ntruncated'), { source: 'received' })).rejects.toThrow('The received PDF could not be read')
})

test('received encrypted input has its source-specific encrypted refusal', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  const plain = await document.save({ useObjectStreams: false })
  const encryptedTrailer = new TextEncoder().encode(new TextDecoder().decode(plain).replace('/Info 3 0 R', '/Encrypt 3 0 R'))
  await expect(loadPdf(encryptedTrailer, { source: 'received' })).rejects.toThrow('The received PDF is encrypted and cannot be read')
})

test('created and loaded documents do not gain automatic metadata', async () => {
  const created = await createPdf()
  created.addPage()
  const loaded = await loadPdf(await created.save())
  const roundTrip = await loadPdf(await loaded.save())

  for (const document of [loaded, roundTrip]) {
    expect(document.getProducer()).toBeUndefined()
    expect(document.getCreator()).toBeUndefined()
    expect(document.getCreationDate()).toBeUndefined()
    expect(document.getModificationDate()).toBeUndefined()
  }
})
