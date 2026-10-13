import type { Paper, Print } from './index.ts'

export const MM_PER_PT = 25.4 / 72
export const MARK_LENGTH_MM = 5
export const MARK_GAP_MM = 1

// Millimetres per named paper, portrait.
export const PAPER_MM: Record<Extract<Paper, string>, { width: number; height: number }> = {
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  tabloid: { width: 279.4, height: 431.8 },
  a3: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
}

const round = (mm: number) => Math.round(mm * 100) / 100

// The sheet a print setting describes, in millimetres, with orientation applied.
export function sheetMm(print: Print): { width: number; height: number } {
  const portrait =
    typeof print.paper === 'string'
      ? PAPER_MM[print.paper]
      : print.paper.unit === 'in'
        ? { width: print.paper.width * 25.4, height: print.paper.height * 25.4 }
        : print.paper.unit === 'pt'
          ? { width: print.paper.width * MM_PER_PT, height: print.paper.height * MM_PER_PT }
          : { width: print.paper.width, height: print.paper.height }
  const [short, long] = [Math.min(portrait.width, portrait.height), Math.max(portrait.width, portrait.height)]
  return print.orientation === 'landscape' ? { width: round(long), height: round(short) } : { width: round(short), height: round(long) }
}

// CSS pixels per millimetre at the 96 dpi every browser lays out at.
export const PX_PER_MM = 96 / 25.4

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
    width: round(sheet.width + print.bleed * 2),
    height: round(sheet.height + print.bleed * 2),
  }
  const trim = {
    x: round(outside + print.bleed),
    y: round(outside + print.bleed),
    width: sheet.width,
    height: sheet.height,
  }
  const safeBox = {
    x: round(trim.x + print.safe),
    y: round(trim.y + print.safe),
    width: round(trim.width - print.safe * 2),
    height: round(trim.height - print.safe * 2),
  }
  const media = { width: round(bleedBox.width + outside * 2), height: round(bleedBox.height + outside * 2) }
  if (!print.marks) return { media, bleedBox, trim, safeBox, marks: [] }

  const leftStart = round(bleedBox.x - MARK_GAP_MM)
  const rightStart = round(bleedBox.x + bleedBox.width + MARK_GAP_MM)
  const topStart = round(bleedBox.y - MARK_GAP_MM)
  const bottomStart = round(bleedBox.y + bleedBox.height + MARK_GAP_MM)
  const right = round(rightStart + MARK_LENGTH_MM)
  const bottom = round(bottomStart + MARK_LENGTH_MM)
  const trimRight = round(trim.x + trim.width)
  const trimBottom = round(trim.y + trim.height)
  const marks = [
    { x1: round(leftStart - MARK_LENGTH_MM), y1: trim.y, x2: leftStart, y2: trim.y },
    { x1: trim.x, y1: round(topStart - MARK_LENGTH_MM), x2: trim.x, y2: topStart },
    { x1: rightStart, y1: trim.y, x2: right, y2: trim.y },
    { x1: trimRight, y1: round(topStart - MARK_LENGTH_MM), x2: trimRight, y2: topStart },
    { x1: round(leftStart - MARK_LENGTH_MM), y1: trimBottom, x2: leftStart, y2: trimBottom },
    { x1: trim.x, y1: bottomStart, x2: trim.x, y2: bottom },
    { x1: rightStart, y1: trimBottom, x2: right, y2: trimBottom },
    { x1: trimRight, y1: bottomStart, x2: trimRight, y2: bottom },
  ]
  return { media, bleedBox, trim, safeBox, marks }
}
