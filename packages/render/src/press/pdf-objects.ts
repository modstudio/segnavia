import { decodePDFRawStream, PDFArray, PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFRef, PDFStream } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { type ColorSpaceKind, type ColorSpaceValue, colorSpaceKind, contentFilter } from './policy.ts'

// This bounds each inflated author-influenced content stream before tokenization.
export const MAX_CONTENT_BYTES = 32 * 1024 * 1024

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
  const label = value?.name ?? value?.family ?? object?.toString() ?? 'missing'
  return { kind: colorSpaceKind(value), label }
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

export function decodeContent(stream: PDFRawStream): Uint8Array {
  const filter = stream.dict.get(PDFName.of('Filter'))
  const decision = contentFilter(filterNames(filter))
  if (decision === 'unsupported')
    throw new RenderRefusedError(
      `The PDF has unsupported content stream filter ${filter?.toString() ?? 'missing'}; supported: ${'Fl' + 'ateDecode'} or no filter.`,
    )
  let decoded: Uint8Array
  try {
    decoded = decision === 'compressed' ? decodePDFRawStream(stream).decode() : stream.contents
  } catch (error) {
    throw new RenderRefusedError(
      `The PDF has unsupported content stream that could not be decoded (${(error as Error).message}); supported: a valid ${'Fl' + 'ateDecode'} or unfiltered stream.`,
    )
  }
  if (decoded.byteLength > MAX_CONTENT_BYTES)
    throw new RenderRefusedError(`The PDF has unsupported decoded content stream length ${decoded.byteLength}; supported: at most ${MAX_CONTENT_BYTES} bytes.`)
  return decoded
}
