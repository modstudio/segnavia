import { type Print, type PrintBoxes, printBoxes, usesPressLayout } from '@segnavia/format'

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
