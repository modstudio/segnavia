import { clip, endPath, type PDFDocument, type PDFEmbeddedPage, type PDFPage, popGraphicsState, pushGraphicsState, rectangle } from 'pdf-lib'

export interface PdfRectangle {
  x: number
  y: number
  width: number
  height: number
}

export async function embedOnePage(output: PDFDocument, bytes: Uint8Array, name: string): Promise<PDFEmbeddedPage> {
  const [embedded] = await output.embedPdf(bytes, [0])
  if (!embedded) throw new Error(`${name} has no PDF page.`)
  return embedded
}

export function drawClippedPage(target: PDFPage, embedded: PDFEmbeddedPage, draw: PdfRectangle, clipBox: PdfRectangle): void {
  target.pushOperators(pushGraphicsState(), rectangle(clipBox.x, clipBox.y, clipBox.width, clipBox.height), clip(), endPath())
  target.drawPage(embedded, draw)
  target.pushOperators(popGraphicsState())
}
