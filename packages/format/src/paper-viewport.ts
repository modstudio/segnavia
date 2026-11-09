import { paperPixels, printBoxes, sheetMm } from './paper.ts'
import type { Print } from './print.ts'

export function usesPressLayout(print: Pick<Print, 'bleed' | 'marks'>): boolean {
  return print.bleed > 0 || print.marks
}

export function paperViewport(print: Print): { width: number; height: number } {
  const size = usesPressLayout(print) ? printBoxes(print).bleedBox : sheetMm(print)
  return { width: paperPixels(size.width), height: paperPixels(size.height) }
}
