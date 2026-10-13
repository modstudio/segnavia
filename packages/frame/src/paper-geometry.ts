import { PX_PER_MM } from '@segnavia/format'

export function paperBoxSize(paper: { width: number; height: number }): { width: number; height: number } {
  return { width: paper.width * PX_PER_MM, height: paper.height * PX_PER_MM }
}

export function clampPaper(paper: number, papers: number): number {
  if (papers === 0) return 0
  return Math.min(Math.max(Math.trunc(Number.isFinite(paper) ? paper : 0), 0), papers - 1)
}

export function paperScale(containerWidth: number, paperWidth: number): number {
  return paperWidth > 0 ? containerWidth / paperWidth : 1
}
