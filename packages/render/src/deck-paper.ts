import type { Deck } from '@segnavia/format'
import type { NotesLayoutGeometry } from '@segnavia/frame/print-document'
import type { PdfRectangle } from './pdf-geometry.ts'
import { pdfPixelBox } from './pdf-geometry.ts'

export const DECK_PRESS_SIZE_REMEDY =
  'A deck sheet with bleed or marks prints at its bleed box, so the content or a CSS rule changed the paper Chromium produced; remove an @page size rule or the rule that resizes the sheet to clear this refusal.'

export function regularSlideDrawBox(
  size: Deck['size'],
  notes: NotesLayoutGeometry | undefined,
  pressSheet: { width: number; height: number } | undefined,
): PdfRectangle {
  const box = notes?.slide ?? { x: 0, y: 0, ...(pressSheet ?? size) }
  return pdfPixelBox(box, notes?.sheet.height ?? pressSheet?.height ?? size.height)
}
