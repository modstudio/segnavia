import type { Deck } from '@segnavia/format'
import type { NotesLayoutGeometry } from '@segnavia/frame/print-document'
import type { PdfRectangle } from './pdf-geometry.ts'
import { pdfPixelBox } from './pdf-geometry.ts'

export function regularSlideDrawBox(
  size: Deck['size'],
  notes: NotesLayoutGeometry | undefined,
  pressSheet: { width: number; height: number } | undefined,
): PdfRectangle {
  const box = notes?.slide ?? { x: 0, y: 0, ...(pressSheet ?? size) }
  return pdfPixelBox(box, notes?.sheet.height ?? pressSheet?.height ?? size.height)
}
