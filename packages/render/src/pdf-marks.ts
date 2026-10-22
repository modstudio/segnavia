import type { MarkColor } from '@segnavia/format'
import {
  lineTo,
  moveTo,
  PDFOperatorNames as Ops,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFOperator,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineWidth,
  stroke,
} from 'pdf-lib'
import { isSeparationAll } from './press/pdf-objects.ts'
import { REGISTRATION_COLORANT } from './press/policy.ts'

const MARK_THICKNESS_PT = 0.25

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
  return page.doc.context.obj(['Separation', REGISTRATION_COLORANT, 'DeviceCMYK', tint])
}

function unusedColorSpaceName(spaces: PDFDict): string {
  if (!spaces.has(PDFName.of(REGISTRATION_COLORANT))) return REGISTRATION_COLORANT
  let index = 1
  while (spaces.has(PDFName.of(`${REGISTRATION_COLORANT}${index}`))) index++
  return `${REGISTRATION_COLORANT}${index}`
}

function ensureRegistrationSpace(page: PDFPage): string {
  const resources = page.node.normalizedEntries().Resources
  let spaces = resources.lookupMaybe(PDFName.of('ColorSpace'), PDFDict)
  if (!spaces) {
    spaces = page.doc.context.obj({})
    resources.set(PDFName.of('ColorSpace'), spaces)
  }
  const existing = spaces.get(PDFName.of(REGISTRATION_COLORANT))
  if (existing && isSeparationAll(page.doc, existing)) return REGISTRATION_COLORANT
  const name = unusedColorSpaceName(spaces)
  spaces.set(PDFName.of(name), registrationSpace(page))
  return name
}

function drawBlackMarks(page: PDFPage, marks: PdfMarkLine[]): void {
  for (const mark of marks) {
    page.drawLine({ start: mark.start, end: mark.end, thickness: MARK_THICKNESS_PT, color: rgb(0, 0, 0) })
  }
}

function drawRegistrationMarks(page: PDFPage, marks: PdfMarkLine[]): void {
  const space = ensureRegistrationSpace(page)
  const operators = [
    pushGraphicsState(),
    PDFOperator.of(Ops.StrokingColorspace, [PDFName.of(space)]),
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
