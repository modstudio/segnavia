import { expect, test } from 'bun:test'
import { Print } from '@segnavia/format'
import { printedPagePdfPlan } from './printed-page-pdf-plan.ts'

test('plans bleed-sized composed papers and press boxes from their bleed source', () => {
  const plan = printedPagePdfPlan(
    [
      { width: 210, height: 297 },
      { width: 279.4, height: 215.9 },
    ],
    Print.parse({ paper: 'a4', bleed: 3, marks: true }),
  )
  expect(plan.sizes.map(({ width, height }) => ({ width, height }))).toEqual([
    { width: 216, height: 303 },
    { width: 285.4, height: 221.9 },
  ])
  expect(plan.pressBoxes?.map(({ trim, bleedBox }) => ({ trim, bleedBox }))).toEqual([
    { trim: { x: 9, y: 9, width: 210, height: 297 }, bleedBox: { x: 6, y: 6, width: 216, height: 303 } },
    { trim: { x: 9, y: 9, width: 279.4, height: 215.9 }, bleedBox: { x: 6, y: 6, width: 285.4, height: 221.9 } },
  ])
  expect(plan.sourceBox).toBe('bleed')
})

test('keeps trim papers and omits press boxes without press layout', () => {
  const papers = [{ width: 210, height: 297 }]
  expect(printedPagePdfPlan(papers, Print.parse({ paper: 'a4' }))).toEqual({ sizes: papers })
})
