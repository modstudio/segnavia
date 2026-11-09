import { type Deck, type Print, type PrintBoxes } from '@segnavia/format'
import type { deckPressSettings, notesLayoutGeometry } from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import type { PdfRectangle } from './pdf-geometry.ts'
import { pdfPixelBox } from './pdf-geometry.ts'

export const DECK_PRESS_SIZE_REMEDY =
  'A deck sheet with bleed or marks prints at its bleed box, so the content or a CSS rule changed the paper Chromium produced; remove an @page size rule or the rule that resizes the sheet to clear this refusal.'

export interface DeckPressContext {
  print?: Print
  boxes?: PrintBoxes
  sheet?: { width: number; height: number }
  active: boolean
  slides: boolean
}

export function deckPressContext(settings: ReturnType<typeof deckPressSettings>): DeckPressContext {
  return {
    print: settings.print,
    boxes: settings.boxes,
    active: settings.active,
    slides: settings.slides,
    sheet: settings.slides ? settings.sheet?.sheet : undefined,
  }
}

export function deckPrintableViewport(size: Deck['size'], notes: ReturnType<typeof notesLayoutGeometry> | undefined, press: DeckPressContext) {
  if (notes) return { width: Math.round(notes.sheet.width), height: Math.round(notes.sheet.height) }
  if (press.sheet) {
    return { width: Math.round(press.sheet.width), height: Math.round(press.sheet.height) }
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
  notes: ReturnType<typeof notesLayoutGeometry> | undefined,
  pressSheet: { width: number; height: number } | undefined,
): PdfRectangle {
  const box = notes?.slide ?? { x: 0, y: 0, ...(pressSheet ?? size) }
  return pdfPixelBox(box, notes?.sheet.height ?? pressSheet?.height ?? size.height)
}
