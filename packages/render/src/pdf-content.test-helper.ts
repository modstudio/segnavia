import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib'

export async function pageContent(bytes: Uint8Array, pageIndex = 0): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(pageIndex).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return streams
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n')
}

export function firstStroke(text: string): { end: { x: number; y: number }; start: { x: number; y: number } } {
  const match = /([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+m\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+l/.exec(text)
  if (!match) throw new Error(`no stroke path in: ${text}`)
  return { start: { x: Number(match[1]), y: Number(match[2]) }, end: { x: Number(match[3]), y: Number(match[4]) } }
}
