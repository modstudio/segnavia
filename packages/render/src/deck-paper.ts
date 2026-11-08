import { type Deck, type Print, type PrintBoxes, PX_PER_MM, printBoxes, usesPressLayout } from '@segnavia/format'
import { deckPressSettings, type NotesLayoutGeometry } from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import type { PdfRectangle } from './pdf-geometry.ts'
import { pdfPixelBox } from './pdf-geometry.ts'

export const DECK_PRESS_SIZE_REMEDY =
  'A deck sheet with bleed or marks prints at its bleed box, so the content or a CSS rule changed the paper Chromium produced; remove an @page size rule or the rule that resizes the sheet to clear this refusal.'

export interface DeckPressContext {
  print?: Print
  boxes?: PrintBoxes
  active: boolean
  slides: boolean
}

export function deckPressContext(
  layout: 'slides' | 'notes' | undefined,
  settings: ReturnType<typeof deckPressSettings>,
): DeckPressContext {
  const print = layout === 'notes' ? settings.notes : settings.sheet?.print
  if (!print) return { active: false, slides: false }
  const boxes = layout === 'notes' ? printBoxes(print) : settings.sheet?.boxes
  const active = layout === 'notes' ? usesPressLayout(print) : (settings.sheet?.active ?? false)
  return { print, boxes, active, slides: active && layout !== 'notes' }
}

export function deckPrintableViewport(size: Deck['size'], notes: NotesLayoutGeometry | undefined, press: DeckPressContext) {
  if (notes) return { width: Math.round(notes.sheet.width), height: Math.round(notes.sheet.height) }
  if (press.active && press.boxes) {
    return { width: Math.round(press.boxes.bleedBox.width * PX_PER_MM), height: Math.round(press.boxes.bleedBox.height * PX_PER_MM) }
  }
  return size
}

export function deckPrintablePdfOptions(press: DeckPressContext): Parameters<Tab['pdf']>[0] {
  if (!press.active || !press.boxes) return { preferCSSPageSize: true, printBackground: true }
  return {
    width: `${press.boxes.bleedBox.width}mm`,
    height: `${press.boxes.bleedBox.height}mm`,
    preferCSSPageSize: false,
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  }
}

export function regularSlideDrawBox(
  size: Deck['size'],
  notes: NotesLayoutGeometry | undefined,
  pressSheet: { width: number; height: number } | undefined,
): PdfRectangle {
  const box = notes?.slide ?? { x: 0, y: 0, ...(pressSheet ?? size) }
  return pdfPixelBox(box, notes?.sheet.height ?? pressSheet?.height ?? size.height)
}
