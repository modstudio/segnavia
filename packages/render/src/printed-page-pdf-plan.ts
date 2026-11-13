import { type Print, type PrintBoxes, paperPixels, printBoxes, usesPressLayout } from '@segnavia/format'

interface Paper {
  width: number
  height: number
}

export type PrintedPagePdfPlan =
  | { sizes: readonly Paper[]; pressBoxes?: undefined; sourceBox?: undefined }
  | { sizes: readonly Paper[]; pressBoxes: readonly PrintBoxes[]; sourceBox: 'bleed' }

export function printedPagePdfPlan(papers: readonly Paper[], print: Print): PrintedPagePdfPlan {
  if (!usesPressLayout(print)) return { sizes: papers }
  const boxes = papers.map((paper) =>
    printBoxes({ ...print, paper: { ...paper, unit: 'mm' }, orientation: paper.width > paper.height ? 'landscape' : 'portrait' }),
  )
  return { sizes: boxes.map((item) => item.bleedBox), pressBoxes: boxes, sourceBox: 'bleed' }
}

export function printedPagePdfPlanWidth(plan: PrintedPagePdfPlan): number {
  return Math.max(...plan.sizes.map((paper) => paperPixels(paper.width)))
}

export function usesPrintedPagePdfPlan(plan: PrintedPagePdfPlan): boolean {
  return plan.pressBoxes !== undefined || plan.sizes.length > 1
}
