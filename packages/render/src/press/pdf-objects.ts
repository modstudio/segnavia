import { inflateSync } from 'node:zlib'
import { PDFArray, PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFRef, PDFStream } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { type ColorSpaceKind, type ColorSpaceValue, colorSpaceKind, colorSpaceLabel, contentFilter } from './policy.ts'

// This bounds each inflated author-influenced content stream before tokenization.
export const MAX_CONTENT_BYTES = 32 * 1024 * 1024

// This bounds all inflated author-influenced content handled by one document pass.
export const MAX_DOCUMENT_CONTENT_BYTES = 128 * 1024 * 1024

export interface ContentBudget {
  calculatorOperations?: number
  decodedByteCeiling?: number
  decodedBytes: number
  shadingSamples?: number
}

export const nameOf = (object: PDFObject | undefined): string | undefined => (object instanceof PDFName ? object.toString().slice(1) : undefined)

export function dictionaryOf(object: PDFObject | undefined): PDFDict | undefined {
  if (object instanceof PDFDict) return object
  if (object instanceof PDFStream) return object.dict
  return undefined
}

export function numberOf(dictionary: PDFDict, key: string): number | undefined {
  return dictionary.lookupMaybe(PDFName.of(key), PDFNumber)?.asNumber()
}

export function arrayNumbers(dictionary: PDFDict, key: string, count: number): number[] {
  const array = dictionary.lookupMaybe(PDFName.of(key), PDFArray)
  if (!array || array.size() !== count) throw new Error(`PDF ${key} has unsupported length ${array?.size() ?? 'missing'}; supported: ${count} numbers`)
  return Array.from({ length: count }, (_, index) => {
    const value = array.lookupMaybe(index, PDFNumber)?.asNumber()
    if (value === undefined) throw new Error(`PDF ${key} has unsupported non-number at index ${index}; supported: ${count} numbers`)
    return value
  })
}

export function replaceArray(dictionary: PDFDict, key: string, values: number[]): void {
  const array = dictionary.context.obj(values)
  dictionary.set(PDFName.of(key), array)
}

export function rawStreamOf(object: PDFObject | undefined): PDFRawStream | undefined {
  return object instanceof PDFRawStream ? object : undefined
}

export function arrayOf(object: PDFObject | undefined): PDFArray | undefined {
  return object instanceof PDFArray ? object : undefined
}

const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

function colorSpaceValue(document: PDFDocument, object: PDFObject | undefined): ColorSpaceValue | undefined {
  const value = resolved(document, object)
  const name = nameOf(value)
  if (name) return { name }
  if (!(value instanceof PDFArray)) return undefined
  const family = nameOf(resolved(document, value.get(0)))
  if (family === 'ICCBased') {
    const profile = rawStreamOf(resolved(document, value.get(1)))
    return { family, channels: profile?.dict.lookupMaybe(PDFName.of('N'), PDFNumber)?.asNumber() }
  }
  if (family === 'Indexed') return { family, base: colorSpaceValue(document, value.get(1)) }
  return { family }
}

export function resolvedColorSpace(document: PDFDocument, object: PDFObject | undefined): { kind: ColorSpaceKind; label: string } {
  const value = colorSpaceValue(document, object)
  return { kind: colorSpaceKind(value), label: object ? colorSpaceLabel(value) : 'missing' }
}

export function isSeparationAll(document: PDFDocument, object: PDFObject | undefined): boolean {
  const value = resolved(document, object)
  if (!(value instanceof PDFArray) || value.size() < 2) return false
  return nameOf(resolved(document, value.get(0))) === 'Separation' && nameOf(resolved(document, value.get(1))) === 'All'
}

// A greyscale destination has one plate, so Separation All is dropped after its stroke becomes DeviceGray black.
export function dropRegistrationColorSpaces(document: PDFDocument, resources: PDFDict | undefined): void {
  const spaces = resources?.lookupMaybe(PDFName.of('ColorSpace'), PDFDict)
  if (!spaces) return
  for (const [name, object] of [...spaces.entries()]) {
    if (isSeparationAll(document, object)) spaces.delete(name)
  }
}

function filterNames(filter: PDFObject | undefined): string[] | undefined {
  if (!filter) return undefined
  const direct = nameOf(filter)
  if (direct) return [direct]
  if (!(filter instanceof PDFArray)) return []
  const names: string[] = []
  for (let index = 0; index < filter.size(); index++) {
    const name = nameOf(filter.get(index))
    if (!name) return []
    names.push(name)
  }
  return names
}

export function decodeContent(stream: PDFRawStream, budget?: ContentBudget): Uint8Array {
  const filter = stream.dict.get(PDFName.of('Filter'))
  const decision = contentFilter(filterNames(filter))
  if (decision.action === 'refuse') throw new RenderRefusedError(`The PDF has unsupported content stream filter other; supported: ${decision.supported}.`)
  let decoded: Uint8Array
  try {
    decoded = decision.encoding === 'compressed' ? inflateSync(stream.contents, { maxOutputLength: MAX_CONTENT_BYTES }) : stream.contents
  } catch (error) {
    // zlib stops at maxOutputLength with this code, so an oversized stream is named as such rather than as corrupt.
    if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE')
      throw new RenderRefusedError(
        `The PDF has unsupported decoded content stream longer than ${MAX_CONTENT_BYTES} bytes; supported: at most ${MAX_CONTENT_BYTES} bytes.`,
      )
    throw new RenderRefusedError(`The PDF has unsupported content stream decode failure; supported: a valid ${'Fl' + 'ateDecode'} or unfiltered stream.`)
  }
  if (decoded.byteLength > MAX_CONTENT_BYTES)
    throw new RenderRefusedError(`The PDF has unsupported decoded content stream length ${decoded.byteLength}; supported: at most ${MAX_CONTENT_BYTES} bytes.`)
  if (budget) {
    budget.decodedBytes += decoded.byteLength
    const ceiling = budget.decodedByteCeiling ?? MAX_DOCUMENT_CONTENT_BYTES
    if (budget.decodedBytes > ceiling)
      throw new RenderRefusedError(`The PDF has unsupported total decoded content length ${budget.decodedBytes}; supported: at most ${ceiling} bytes.`)
  }
  return decoded
}
