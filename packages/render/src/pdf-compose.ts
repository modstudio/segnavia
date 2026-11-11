import type { Imposed, ImpositionSideBoxes, ImpositionSideMarks, MarkColor } from '@segnavia/format'
import { clip, endPath, type PDFDocument, type PDFEmbeddedPage, type PDFPage, popGraphicsState, pushGraphicsState, rectangle } from 'pdf-lib'
import type { PiecePlacement } from './pages-imposition.ts'
import { placementPdfGeometry } from './pages-imposition.ts'
import { type PdfRectangle, pdfBox, pdfPoint, pt } from './pdf-geometry.ts'
import { createPdf, loadPdf } from './pdf-load.ts'
import { drawCropMarks } from './pdf-marks.ts'

export async function embedOnePage(output: PDFDocument, bytes: Uint8Array, name: string): Promise<PDFEmbeddedPage> {
  const source = await loadPdf(bytes)
  const [embedded] = await output.embedPdf(source, [0])
  if (!embedded) throw new Error(`${name} has no PDF page.`)
  return embedded
}

export function drawClippedPage(target: PDFPage, embedded: PDFEmbeddedPage, draw: PdfRectangle, clipBox: PdfRectangle): void {
  target.pushOperators(pushGraphicsState(), rectangle(clipBox.x, clipBox.y, clipBox.width, clipBox.height), clip(), endPath())
  target.drawPage(embedded, draw)
  target.pushOperators(popGraphicsState())
}

export interface ImposedPdfPiece {
  key: string
  name: string
  bytes: Uint8Array
  placements: PiecePlacement[]
}

export interface ImposedPdfSide {
  boxes: ImpositionSideBoxes
  marks?: ImpositionSideMarks
}

function drawImposedSide(
  output: PDFDocument,
  imposed: Imposed,
  embedded: Map<string, PDFEmbeddedPage>,
  pieces: ImposedPdfPiece[],
  paperIndex: number,
  side: 'front' | 'back',
  boxes: ImpositionSideBoxes,
  marks: ImpositionSideMarks | undefined,
  markColor: MarkColor,
): void {
  const paper = output.addPage([pt(imposed.paper.width), pt(imposed.paper.height)])
  const trim = pdfBox(boxes.trim, imposed.paper.height)
  const bleedBox = pdfBox(boxes.bleedBox, imposed.paper.height)
  paper.setTrimBox(trim.x, trim.y, trim.width, trim.height)
  paper.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height)
  for (const piece of pieces) {
    const image = embedded.get(piece.key)
    if (!image) throw new Error(`${piece.name} was not embedded.`)
    for (const { placement, layout } of piece.placements) {
      if (placement.paper !== paperIndex || placement.side !== side) continue
      const { draw, clip: clipBox } = placementPdfGeometry(placement, layout, imposed.paper.height)
      drawClippedPage(paper, image, draw, clipBox)
    }
  }
  drawCropMarks(
    paper,
    (marks?.marks ?? []).map((mark) => ({
      start: pdfPoint(mark.x1, mark.y1, imposed.paper.height),
      end: pdfPoint(mark.x2, mark.y2, imposed.paper.height),
      dashed: mark.dashed,
    })),
    markColor,
  )
}

export async function composeImposedPdf(imposed: Imposed, pieces: ImposedPdfPiece[], sides: ImposedPdfSide[], markColor: MarkColor): Promise<Uint8Array> {
  const output = await createPdf()
  const embedded = new Map<string, PDFEmbeddedPage>()
  for (const piece of pieces) embedded.set(piece.key, await embedOnePage(output, piece.bytes, piece.name))
  for (let paperIndex = 0; paperIndex < imposed.papers; paperIndex += 1) {
    for (const { boxes, marks } of sides) {
      drawImposedSide(output, imposed, embedded, pieces, paperIndex, boxes.side, boxes, marks, markColor)
    }
  }
  return output.save()
}
