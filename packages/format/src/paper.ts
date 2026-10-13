import type { Paper, Print } from './index.ts'

export const MM_PER_PT = 25.4 / 72
export const MARK_LENGTH_MM = 5
export const MARK_GAP_MM = 1

// Millimeters per named paper, portrait.
export const PAPER_MM: Record<Extract<Paper, string>, { width: number; height: number }> = {
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  tabloid: { width: 279.4, height: 431.8 },
  a3: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
}

export const roundMillimeters = (mm: number) => Math.round(mm * 100) / 100

export function toMillimeters(value: number, unit: 'mm' | 'in' | 'pt'): number {
  return value * (unit === 'in' ? 25.4 : unit === 'pt' ? MM_PER_PT : 1)
}

// The sheet a print setting describes, in millimeters, with orientation applied.
export function sheetMm(print: Pick<Print, 'paper' | 'orientation'>): { width: number; height: number } {
  const portrait =
    typeof print.paper === 'string'
      ? PAPER_MM[print.paper]
      : { width: toMillimeters(print.paper.width, print.paper.unit), height: toMillimeters(print.paper.height, print.paper.unit) }
  const [short, long] = [Math.min(portrait.width, portrait.height), Math.max(portrait.width, portrait.height)]
  return print.orientation === 'landscape'
    ? { width: roundMillimeters(long), height: roundMillimeters(short) }
    : { width: roundMillimeters(short), height: roundMillimeters(long) }
}

// CSS pixels per millimeter at the 96 dpi every browser lays out at.
export const PX_PER_MM = 96 / 25.4

export function printProperties(print: Print): string {
  return `:root{--segnavia-bleed:${print.bleed}mm;--segnavia-safe:${print.safe}mm}`
}

export interface PaperBox {
  x: number
  y: number
  width: number
  height: number
}

export interface MarkSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PrintBoxes {
  media: { width: number; height: number }
  bleedBox: PaperBox
  trim: PaperBox
  safeBox: PaperBox
  marks: MarkSegment[]
}

export function printBoxes(print: Print): PrintBoxes {
  const sheet = sheetMm(print)
  const outside = print.marks ? MARK_GAP_MM + MARK_LENGTH_MM : 0
  const bleedBox = {
    x: outside,
    y: outside,
    width: roundMillimeters(sheet.width + print.bleed * 2),
    height: roundMillimeters(sheet.height + print.bleed * 2),
  }
  const trim = {
    x: roundMillimeters(outside + print.bleed),
    y: roundMillimeters(outside + print.bleed),
    width: sheet.width,
    height: sheet.height,
  }
  const safeBox = {
    x: roundMillimeters(trim.x + print.safe),
    y: roundMillimeters(trim.y + print.safe),
    width: roundMillimeters(trim.width - print.safe * 2),
    height: roundMillimeters(trim.height - print.safe * 2),
  }
  const media = { width: roundMillimeters(bleedBox.width + outside * 2), height: roundMillimeters(bleedBox.height + outside * 2) }
  if (!print.marks) return { media, bleedBox, trim, safeBox, marks: [] }

  const leftStart = roundMillimeters(bleedBox.x - MARK_GAP_MM)
  const rightStart = roundMillimeters(bleedBox.x + bleedBox.width + MARK_GAP_MM)
  const topStart = roundMillimeters(bleedBox.y - MARK_GAP_MM)
  const bottomStart = roundMillimeters(bleedBox.y + bleedBox.height + MARK_GAP_MM)
  const right = roundMillimeters(rightStart + MARK_LENGTH_MM)
  const bottom = roundMillimeters(bottomStart + MARK_LENGTH_MM)
  const trimRight = roundMillimeters(trim.x + trim.width)
  const trimBottom = roundMillimeters(trim.y + trim.height)
  const marks = [
    { x1: roundMillimeters(leftStart - MARK_LENGTH_MM), y1: trim.y, x2: leftStart, y2: trim.y },
    { x1: trim.x, y1: roundMillimeters(topStart - MARK_LENGTH_MM), x2: trim.x, y2: topStart },
    { x1: rightStart, y1: trim.y, x2: right, y2: trim.y },
    { x1: trimRight, y1: roundMillimeters(topStart - MARK_LENGTH_MM), x2: trimRight, y2: topStart },
    { x1: roundMillimeters(leftStart - MARK_LENGTH_MM), y1: trimBottom, x2: leftStart, y2: trimBottom },
    { x1: trim.x, y1: bottomStart, x2: trim.x, y2: bottom },
    { x1: rightStart, y1: trimBottom, x2: right, y2: trimBottom },
    { x1: trimRight, y1: bottomStart, x2: trimRight, y2: bottom },
  ]
  return { media, bleedBox, trim, safeBox, marks }
}
