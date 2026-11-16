import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'
import type { ResolvedLimits } from '@segnavia/format'
import { EncryptedPDFError, PDFDocument } from 'pdf-lib'
import { ReceivedPdfError, RenderRefusedError } from './errors.ts'
import { decodePdfStreamBounded } from './pdf-stream-bounds.ts'

// The largest stream in the fidelity and demo renders is 36,325 bytes. 16 MiB
// leaves a 462x margin for larger documents while placing a hard bound on zlib.
export const MAX_PDF_STREAM_BYTES = 16 * 1024 * 1024

interface StreamObject {
  dictionary: string
  number: number
  start: number
}

const whitespace = '[\\x00\\x09\\x0a\\x0c\\x0d\\x20]'

function nextObject(bytes: Buffer, from: number): { body: number; number: number } | undefined {
  let marker = bytes.indexOf(' obj', from, 'latin1')
  while (marker !== -1) {
    const prefix = bytes.toString('latin1', Math.max(0, marker - 48), marker)
    const match = prefix.match(/(\d+)\s+(\d+)\s*$/)
    if (match?.[1]) return { body: marker + 4, number: Number(match[1]) }
    marker = bytes.indexOf(' obj', marker + 4, 'latin1')
  }
  return undefined
}

function streamStart(bytes: Buffer, from: number, end: number): number | undefined {
  let marker = bytes.indexOf('stream', from, 'latin1')
  while (marker !== -1 && marker < end) {
    const before = bytes[marker - 1]
    const after = bytes[marker + 6]
    const delimited = before !== undefined && (before === 0x20 || before === 0x0a || before === 0x0d || before === 0x09)
    if (delimited && after === 0x0a) return marker + 7
    if (delimited && after === 0x0d && bytes[marker + 7] === 0x0a) return marker + 8
    marker = bytes.indexOf('stream', marker + 6, 'latin1')
  }
  return undefined
}

function referencedValue(bytes: Buffer, object: number, generation: number): string | undefined {
  const marker = Buffer.from(`${object} ${generation} obj`, 'latin1')
  let start = bytes.indexOf(marker)
  while (start !== -1) {
    const before = bytes[start - 1]
    if (start === 0 || before === 0x0a || before === 0x0d || before === 0x20) {
      const body = start + marker.length
      const end = bytes.indexOf('endobj', body, 'latin1')
      if (end !== -1) return bytes.toString('latin1', body, end).trim()
    }
    start = bytes.indexOf(marker, start + marker.length)
  }
  return undefined
}

function dictionaryValue(dictionary: string, key: string, bytes: Buffer): string | undefined {
  const direct = dictionary.match(new RegExp(`/${key}${whitespace}+(\\d+)(?:${whitespace}+(\\d+)${whitespace}+R)?`))
  if (direct?.[1] && direct[2]) return referencedValue(bytes, Number(direct[1]), Number(direct[2]))
  return direct?.[1]
}

function streamType(dictionary: string, bytes: Buffer): 'ObjStm' | 'XRef' | undefined {
  const direct = dictionary.match(new RegExp(`/Type${whitespace}*/(ObjStm|XRef)\\b`))?.[1]
  if (direct === 'ObjStm' || direct === 'XRef') return direct
  const reference = dictionary.match(new RegExp(`/Type${whitespace}+(\\d+)${whitespace}+(\\d+)${whitespace}+R`))
  if (!reference?.[1] || !reference[2]) return undefined
  const value = referencedValue(bytes, Number(reference[1]), Number(reference[2]))
  return value === '/ObjStm' ? 'ObjStm' : value === '/XRef' ? 'XRef' : undefined
}

function dictionaryToken(dictionary: string, key: string): string | undefined {
  const value = dictionary.match(new RegExp(`/${key}${whitespace}*(\\[[^\\]]*\\]|<<[^>]*>>|/[A-Za-z0-9]+|\\d+${whitespace}+\\d+${whitespace}+R)`))?.[1]
  if (!value) return dictionary.includes(`/${key}`) ? undefined : ''
  return value
}

function resolvedDictionaryValue(dictionary: string, key: string, bytes: Buffer): string | undefined {
  const value = dictionaryToken(dictionary, key)
  if (!value) return value
  const reference = value.match(new RegExp(`^(\\d+)${whitespace}+(\\d+)${whitespace}+R$`))
  return reference?.[1] && reference[2] ? referencedValue(bytes, Number(reference[1]), Number(reference[2])) : value
}

function filters(dictionary: string, bytes: Buffer): string[] | undefined {
  const value = resolvedDictionaryValue(dictionary, 'Filter', bytes)
  if (value === undefined) return undefined
  if (value === '') return []
  const names = [...value.matchAll(/\/([A-Za-z0-9]+)/g)].map((match) => match[1] as string)
  return names.length > 0 ? names : undefined
}

function earlyChange(dictionary: string, count: number): Array<{ earlyChange?: 0 | 1 } | undefined> | undefined {
  const value = dictionaryToken(dictionary, 'DecodeParms')
  if (value === undefined) return undefined
  if (value === '') return Array.from({ length: count })
  const entries = value.startsWith('[') ? [...value.matchAll(/null|<<[^>]*>>/g)].map((match) => match[0]) : [value]
  if (entries.length !== count) return undefined
  const parameters: Array<{ earlyChange?: 0 | 1 } | undefined> = []
  for (const entry of entries) {
    if (entry === 'null') {
      parameters.push(undefined)
      continue
    }
    if (!entry.startsWith('<<')) return undefined
    const match = entry.match(new RegExp(`/EarlyChange${whitespace}+(\\d+)`))
    if (!match) {
      parameters.push({})
      continue
    }
    const parsed = Number(match[1])
    if (parsed !== 0 && parsed !== 1) return undefined
    parameters.push({ earlyChange: parsed })
  }
  return parameters
}

function refuseUnknown(number: number, fact: string): never {
  throw new RenderRefusedError(
    `PDF stream object ${number}'s inflated size could not be established before loading because its ${fact} is unsupported. Use a valid PDF produced by this renderer with a direct length and no filter or one FlateDecode filter to clear this refusal.`,
  )
}

function streamObjects(pdf: Uint8Array): StreamObject[] {
  const bytes = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength)
  const streams: StreamObject[] = []
  let cursor = 0
  while (cursor < bytes.length) {
    const object = nextObject(bytes, cursor)
    if (!object) break
    const endObject = bytes.indexOf('endobj', object.body, 'latin1')
    if (endObject === -1) break
    const start = streamStart(bytes, object.body, endObject)
    if (start === undefined) {
      cursor = endObject + 6
      continue
    }
    const dictionary = bytes.toString('latin1', object.body, start - 6)
    const lengthValue = dictionaryValue(dictionary, 'Length', bytes)
    const length = lengthValue?.match(/^\s*(\d+)\s*$/)?.[1]
    if (streamType(dictionary, bytes)) {
      if (!length) refuseUnknown(object.number, 'declared length')
      streams.push({ dictionary, number: object.number, start })
    }
    cursor = length ? Math.min(bytes.length, start + Number(length)) : endObject + 6
  }
  return streams
}

function refusal(number: number, size: number, ceiling: number): RenderRefusedError {
  return new RenderRefusedError(
    `PDF stream object ${number} inflated past the ceiling after ${size} bytes; the ceiling is ${ceiling} bytes. Reduce the page content that Chromium packs into one object or cross-reference stream to clear this refusal.`,
  )
}

export function assertPdfStreamsBounded(pdf: Uint8Array, ceiling = MAX_PDF_STREAM_BYTES): void {
  const bytes = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength)
  for (const stream of streamObjects(pdf)) {
    const length = Number(dictionaryValue(stream.dictionary, 'Length', bytes))
    if (!Number.isSafeInteger(length) || length < 0 || stream.start + length > bytes.length) refuseUnknown(stream.number, 'declared length')
    const encodings = filters(stream.dictionary, bytes)
    if (!encodings || encodings.length > 1 || (encodings.length === 1 && encodings[0] !== 'FlateDecode')) {
      refuseUnknown(stream.number, `decode filter ${encodings?.join(', ') || 'value'}`)
    }
    if (encodings.length === 0) {
      if (length > ceiling) throw refusal(stream.number, length, ceiling)
      continue
    }
    try {
      inflateSync(bytes.subarray(stream.start, stream.start + length), { maxOutputLength: ceiling })
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE') throw refusal(stream.number, ceiling, ceiling)
      refuseUnknown(stream.number, 'FlateDecode data')
    }
  }
}

export interface ReceivedPdfLoadOptions {
  source: 'received'
  operation: 'pdfPageImage' | 'placements.resolve' | 'stampPdf'
  limits: Pick<ResolvedLimits, 'input'>
}

function assertReceivedStreamsBounded(pdf: Uint8Array, ceiling: number): void {
  const bytes = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength)
  for (const stream of streamObjects(pdf)) {
    const length = Number(dictionaryValue(stream.dictionary, 'Length', bytes))
    if (!Number.isSafeInteger(length) || length < 0 || stream.start + length > bytes.length) {
      throw new RenderRefusedError(
        `Received PDF stream object ${stream.number} has no usable direct length; use a valid PDF with bounded object and cross-reference streams to clear this refusal.`,
      )
    }
    const encodings = filters(stream.dictionary, bytes)
    if (!encodings) {
      throw new RenderRefusedError(
        `Received PDF stream object ${stream.number} has an unreadable decode filter; use a valid PDF stream filter to clear this refusal.`,
      )
    }
    const parameters = earlyChange(stream.dictionary, encodings.length)
    if (!parameters || parameters.length !== encodings.length) {
      throw new RenderRefusedError(
        `Received PDF stream object ${stream.number} has unreadable decode parameters; use valid direct DecodeParms to clear this refusal.`,
      )
    }
    decodePdfStreamBounded(bytes.subarray(stream.start, stream.start + length), encodings, stream.number, ceiling, parameters)
  }
}

function isReceived(options: Parameters<typeof PDFDocument.load>[1] | ReceivedPdfLoadOptions | undefined): options is ReceivedPdfLoadOptions {
  return Boolean(options && 'source' in options && options.source === 'received')
}

export async function loadPdf(pdf: Uint8Array, options?: Parameters<typeof PDFDocument.load>[1] | ReceivedPdfLoadOptions): Promise<PDFDocument> {
  if (!isReceived(options)) {
    assertPdfStreamsBounded(pdf)
    return PDFDocument.load(pdf, { ...options, updateMetadata: false })
  }
  const { bytes: byteLimit, streamBytes: streamLimit } = options.limits.input
  const operation = options.operation
  if (pdf.byteLength > byteLimit) {
    throw new ReceivedPdfError(
      'too-large',
      `The received PDF is ${pdf.byteLength} bytes, above the limits.input.bytes limit of ${byteLimit}; raise the host's limits.input.bytes, or use a smaller PDF, to clear this refusal.`,
    )
  }
  const receivedText = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength).toString('latin1')
  if (!receivedText.startsWith('%PDF-') || !receivedText.slice(-1024).includes('%%EOF')) {
    throw new ReceivedPdfError('unreadable', `The received PDF could not be read; pass a complete, valid PDF to ${operation} to clear this refusal.`)
  }
  if (/\/Encrypt\s+\d+\s+\d+\s+R\b/.test(receivedText)) {
    throw new ReceivedPdfError(
      'encrypted',
      `The received PDF is encrypted and cannot be read; decrypt it before passing it to ${operation} to clear this refusal.`,
    )
  }
  try {
    assertReceivedStreamsBounded(pdf, streamLimit)
    return await PDFDocument.load(pdf, { updateMetadata: false })
  } catch (error) {
    if (error instanceof ReceivedPdfError) throw error
    if (error instanceof EncryptedPDFError) {
      throw new ReceivedPdfError(
        'encrypted',
        `The received PDF is encrypted and cannot be read; decrypt it before passing it to ${operation} to clear this refusal.`,
      )
    }
    if (error instanceof RenderRefusedError) throw new ReceivedPdfError('unreadable', error.message)
    throw new ReceivedPdfError('unreadable', `The received PDF could not be read; pass a complete, valid PDF to ${operation} to clear this refusal.`)
  }
}

export type PdfRewritePhase = 'read' | 'rewrite'

export function classifyPdfRewriteFailure(phase: PdfRewritePhase, error: unknown, step: string): RenderRefusedError {
  if (phase === 'rewrite' && error instanceof RenderRefusedError) return error
  if (phase === 'rewrite') {
    const message = error instanceof Error ? error.message : String(error)
    return new RenderRefusedError(`The ${step} failed after the PDF was read: ${message}`, { cause: error })
  }
  return new RenderRefusedError('The PDF has unsupported malformed structure; supported: a valid PDF produced by the renderer.')
}

export async function rewritePdf<T>(bytes: Uint8Array, step: string, rewrite: (document: PDFDocument) => T | Promise<T>): Promise<T> {
  let document: PDFDocument
  try {
    document = await loadPdf(bytes)
    document.getPages()
  } catch (error) {
    throw classifyPdfRewriteFailure('read', error, step)
  }
  try {
    return await rewrite(document)
  } catch (error) {
    throw classifyPdfRewriteFailure('rewrite', error, step)
  }
}

export function createPdf(): Promise<PDFDocument> {
  return PDFDocument.create({ updateMetadata: false })
}
