import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { resolveLimits } from '@segnavia/format'
import { PDFDocument } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { classifyPdfRewriteFailure, createPdf, loadPdf, MAX_PDF_STREAM_BYTES } from './pdf-load.ts'

const receivedLimits = (input?: { bytes?: number; streamBytes?: number }) => resolveLimits(undefined, input ? { input } : undefined)

function objectStream(contents: Uint8Array, filter = '/Filter /FlateDecode'): Uint8Array {
  const compressed = deflateSync(contents)
  const indirect = filter.includes('2 0 R') ? '2 0 obj\n/FlateDecode\nendobj\n' : ''
  const prefix = Buffer.from(`%PDF-1.7\n${indirect}1 0 obj\n<</Type /ObjStm /N 1 /First 4 ${filter} /Length ${compressed.length}>>\nstream\n`)
  const suffix = Buffer.from('\nendstream\nendobj\n%%EOF')
  return Buffer.concat([prefix, compressed, suffix])
}

function lzwEarlyChangeZero(contents: Uint8Array): Uint8Array {
  let tableLength = 258
  let width = 9
  let previous = false
  let bits = ''
  for (const code of [256, ...contents, 257]) {
    bits += code.toString(2).padStart(width, '0')
    if (code === 256) {
      tableLength = 258
      width = 9
      previous = false
    } else if (code !== 257) {
      if (previous) {
        tableLength += 1
        if (tableLength === 1 << width && width < 12) width += 1
      }
      previous = true
    }
  }
  return Uint8Array.from(
    Array.from({ length: Math.ceil(bits.length / 8) }, (_, index) => Number.parseInt(bits.slice(index * 8, index * 8 + 8).padEnd(8, '0'), 2)),
  )
}

function encodedObjectStream(encoded: Uint8Array, dictionary: string): Uint8Array {
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n<</Type /ObjStm /N 1 /First 4 ${dictionary} /Length ${encoded.length}>>\nstream\n`),
    encoded,
    Buffer.from('\nendstream\nendobj\n%%EOF'),
  ])
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

test.each(['press conversion', 'effects rewrite'] as const)('classifies read and rewrite failures for %s', (step) => {
  const refusal = new RenderRefusedError('rewrite refused')
  const readError = new Error('catalog failed')
  const readRefusal = classifyPdfRewriteFailure('read', refusal, step)
  expect(readRefusal).not.toBe(refusal)
  expect(readRefusal.message).toContain('malformed structure')
  const malformed = classifyPdfRewriteFailure('read', readError, step)
  expect(malformed.message).toContain('malformed structure')

  expect(classifyPdfRewriteFailure('rewrite', refusal, step)).toBe(refusal)
  const rewriteError = new Error('decoder crashed')
  const rendererError = classifyPdfRewriteFailure('rewrite', rewriteError, step)
  expect(rendererError.message).toBe(`The ${step} failed after the PDF was read: decoder crashed`)
  expect(rendererError.message).not.toContain('malformed')
  expect(rendererError.cause).toBe(rewriteError)
})

test('received input is refused above its byte limit before parsing', async () => {
  await expect(loadPdf(Uint8Array.of(1, 2), { source: 'received', operation: 'stampPdf', limits: receivedLimits({ bytes: 1 }) })).rejects.toThrow(
    'above the limits.input.bytes limit of 1',
  )
})

test.each(['/Filter /FlateDecode', '/Filter[/FlateDecode]', '/Filter 2 0 R'])('received stream cap follows %s', async (filter) => {
  const pdf = objectStream(new Uint8Array(4096), filter)
  await expect(loadPdf(pdf, { source: 'received', operation: 'stampPdf', limits: receivedLimits({ streamBytes: 1000 }) })).rejects.toThrow(
    'limits.input.streamBytes limit of 1000',
  )
})

test('received stream cap uses the host value and defaults when omitted', async () => {
  const contents = new TextEncoder().encode(`2 0 <<>>${' '.repeat(56)}`)
  const pdf = objectStream(contents)
  await expect(loadPdf(pdf, { source: 'received', operation: 'stampPdf', limits: receivedLimits({ streamBytes: 32 }) })).rejects.toThrow(
    'limits.input.streamBytes limit of 32',
  )
  await expect(loadPdf(pdf, { source: 'received', operation: 'stampPdf', limits: receivedLimits() })).resolves.toBeInstanceOf(PDFDocument)
})

test('received LZW stream reads direct EarlyChange 0 decode parameters', async () => {
  const contents = new TextEncoder().encode(`2 0 <<>>${' '.repeat(252)}`)
  const pdf = encodedObjectStream(lzwEarlyChangeZero(contents), '/Filter /LZWDecode /DecodeParms << /EarlyChange 0 >>')
  await expect(loadPdf(pdf, { source: 'received', operation: 'stampPdf', limits: receivedLimits() })).resolves.toBeInstanceOf(PDFDocument)
})

test('received truncated input has its source-specific unreadable refusal', async () => {
  await expect(
    loadPdf(new TextEncoder().encode('%PDF-1.7\ntruncated'), { source: 'received', operation: 'stampPdf', limits: receivedLimits() }),
  ).rejects.toThrow('The received PDF could not be read')
})

test('received encrypted input has its source-specific encrypted refusal', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  const plain = await document.save({ useObjectStreams: false })
  const encryptedTrailer = new TextEncoder().encode(new TextDecoder().decode(plain).replace('/Info 3 0 R', '/Encrypt 3 0 R'))
  await expect(loadPdf(encryptedTrailer, { source: 'received', operation: 'stampPdf', limits: receivedLimits() })).rejects.toThrow(
    'The received PDF is encrypted and cannot be read',
  )
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
