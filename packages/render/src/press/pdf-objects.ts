import { PDFArray, PDFDict, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFStream } from 'pdf-lib'

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
