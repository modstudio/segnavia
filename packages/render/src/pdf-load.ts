import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'

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

function filters(dictionary: string): string[] | undefined {
  const value = dictionary.match(new RegExp(`/Filter${whitespace}+(\\[[^\\]]*\\]|/[A-Za-z0-9]+)`))?.[1]
  if (!value) return []
  const names = [...value.matchAll(/\/([A-Za-z0-9]+)/g)].map((match) => match[1] as string)
  return names.length > 0 ? names : undefined
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
    const encodings = filters(stream.dictionary)
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

export async function loadPdf(
  pdf: Uint8Array,
  options?: Parameters<typeof PDFDocument.load>[1],
): Promise<PDFDocument> {
  assertPdfStreamsBounded(pdf)
  return PDFDocument.load(pdf, options)
}
