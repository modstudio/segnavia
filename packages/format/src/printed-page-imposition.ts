import type { Imposition, Print } from './index.ts'
import { sheetMm, toMillimeters } from './paper.ts'

const close = (left: number, right: number) => Math.abs(left - right) <= 0.01

/** True when an imposition leaves one printed page unchanged on one paper. */
export function isPrintedPageIdentityImposition(print: Print, imposition: Imposition): boolean {
  const pagePaper = sheetMm(print)
  const imposedPaper = sheetMm(imposition)
  const mm = (value: number) => toMillimeters(value, imposition.unit)
  return (
    print.orientation === imposition.orientation &&
    close(pagePaper.width, imposedPaper.width) &&
    close(pagePaper.height, imposedPaper.height) &&
    imposition.columns === 1 &&
    imposition.rows === 1 &&
    close(mm(imposition.cell.width ?? 0), pagePaper.width) &&
    close(mm(imposition.cell.height), pagePaper.height) &&
    Object.values(imposition.margin).every((value) => value === 0) &&
    imposition.gap.column === 0 &&
    imposition.gap.row === 0 &&
    imposition.bleed === 0 &&
    imposition.marks === false &&
    imposition.cornerMarks === false &&
    imposition.fill === 'sequence' &&
    imposition.sides !== 'two' &&
    imposition.skip === 0 &&
    imposition.fold === undefined
  )
}
