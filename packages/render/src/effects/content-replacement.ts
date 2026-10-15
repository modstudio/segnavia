import { PDFName, type PDFObject, type PDFRawStream } from 'pdf-lib'

const key = (name: string): PDFName => PDFName.of(name)

export function streamDictionary(stream: PDFRawStream): Record<string, PDFObject> {
  const dictionary: Record<string, PDFObject> = { Filter: key('Fl' + 'ateDecode') }
  for (const [name, value] of stream.dict.entries()) {
    const label = name.toString().slice(1)
    if (!['Filter', 'DecodeP' + 'arms', 'Length'].includes(label)) dictionary[label] = value
  }
  return dictionary
}

export function replaceRanges(bytes: Uint8Array, replacements: Array<{ end: number; start: number; text: string }>): Uint8Array {
  const encoder = new TextEncoder()
  let length = bytes.length
  for (const item of replacements) length += encoder.encode(item.text).length - (item.end - item.start)
  const output = new Uint8Array(length)
  let inputAt = 0
  let outputAt = 0
  for (const item of replacements) {
    output.set(bytes.subarray(inputAt, item.start), outputAt)
    outputAt += item.start - inputAt
    const inserted = encoder.encode(item.text)
    output.set(inserted, outputAt)
    outputAt += inserted.length
    inputAt = item.end
  }
  output.set(bytes.subarray(inputAt), outputAt)
  return output
}
