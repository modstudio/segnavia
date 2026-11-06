import { paperPixels, printBoxes, sheetMm } from './paper.ts'
import type { Print } from './print.ts'

export function paperViewport(print: Print): { width: number; height: number } {
  const size = print.bleed > 0 || print.marks ? printBoxes(print).bleedBox : sheetMm(print)
  return { width: paperPixels(size.width), height: paperPixels(size.height) }
}
