import { type Page, type Print, PX_PER_MM, sheetMm } from '@segnavia/format'

export function paperBoxSize(paper: { width: number; height: number }): { width: number; height: number } {
  return { width: paper.width * PX_PER_MM, height: paper.height * PX_PER_MM }
}

export interface PageOnPaper {
  aspect: number
  box: { width: number; height: number }
  page: Page
}

export function projectPageOnPaper(page: Page, print: Print): PageOnPaper {
  const box = paperBoxSize(sheetMm(print))
  const fixed = typeof page.size === 'object' && page.size.height !== 'auto'
  return {
    aspect: box.width / box.height,
    box,
    page: fixed ? page : { ...page, size: { width: Math.round(box.width), height: Math.round(box.height) } },
  }
}

export function clampPaper(paper: number, papers: number): number {
  if (papers === 0) return 0
  return Math.min(Math.max(Math.trunc(Number.isFinite(paper) ? paper : 0), 0), papers - 1)
}

export function paperScale(containerWidth: number, paperWidth: number): number {
  return paperWidth > 0 ? containerWidth / paperWidth : 1
}
