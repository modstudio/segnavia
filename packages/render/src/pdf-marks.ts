import type { MarkColor } from '@segnavia/format'
import {
  lineTo,
  moveTo,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames as Ops,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineWidth,
  stroke,
} from 'pdf-lib'

const MARK_THICKNESS_PT = 0.25
const ALL = 'All'

export interface PdfMarkLine {
  end: { x: number; y: number }
  start: { x: number; y: number }
}

function registrationSpace(page: PDFPage) {
  const tint = page.doc.context.obj({
    FunctionType: 2,
    Domain: [0, 1],
    C0: [0, 0, 0, 0],
    C1: [1, 1, 1, 1],
    N: 1,
  })
  return page.doc.context.obj(['Separation', ALL, 'DeviceCMYK', tint])
}

function ensureRegistrationSpace(page: PDFPage): void {
  const resources = page.node.normalizedEntries().Resources
  let spaces = resources.lookupMaybe(PDFName.of('ColorSpace'), PDFDict)
  if (!spaces) {
    spaces = page.doc.context.obj({})
    resources.set(PDFName.of('ColorSpace'), spaces)
  }
  if (!spaces.has(PDFName.of(ALL))) spaces.set(PDFName.of(ALL), registrationSpace(page))
}

function drawBlackMarks(page: PDFPage, marks: PdfMarkLine[]): void {
  for (const mark of marks) {
    page.drawLine({ start: mark.start, end: mark.end, thickness: MARK_THICKNESS_PT, color: rgb(0, 0, 0) })
  }
}

function drawRegistrationMarks(page: PDFPage, marks: PdfMarkLine[]): void {
  ensureRegistrationSpace(page)
  const operators = [
    pushGraphicsState(),
    PDFOperator.of(Ops.StrokingColorspace, [PDFName.of(ALL)]),
    PDFOperator.of(Ops.StrokingColorN, [PDFNumber.of(1)]),
    setLineWidth(MARK_THICKNESS_PT),
  ]
  for (const mark of marks) {
    operators.push(moveTo(mark.start.x, mark.start.y), lineTo(mark.end.x, mark.end.y), stroke())
  }
  operators.push(popGraphicsState())
  page.pushOperators(...operators)
}

export function drawCropMarks(page: PDFPage, marks: PdfMarkLine[], color: MarkColor = 'black'): void {
  if (marks.length === 0) return
  if (color === 'registration') drawRegistrationMarks(page, marks)
  else drawBlackMarks(page, marks)
}
