import type { DocumentResult } from './types.ts'

export function pageCountRefusal(screenCount: number, pdfCount: number): string | undefined {
  if (screenCount === pdfCount) return undefined
  return `The book has ${screenCount} screen papers and ${pdfCount} PDF pages.`
}

export function bookPagesPass(pages: DocumentResult[]): boolean {
  return pages.every((page) => Object.values(page.bars).every((bar) => bar.passed))
}

export function faultControlProvesShift(page: DocumentResult): boolean {
  return Boolean(page.faultControl) && !page.bars.pressColor.passed && page.bars.pressColor.measured !== undefined
}

export function faultControlFailure(page: DocumentResult): string | undefined {
  if (!page.faultControl) return undefined
  if (page.bars.pressColor.measured === undefined) {
    return 'The fault control has no press measurement; set SEGNAVIA_FIDELITY_PROFILE so the one-line shift can be judged.'
  }
  if (page.bars.pressColor.passed) {
    const measured = page.bars.pressColor.measured
    const mean = 'mean' in measured ? measured.mean.toFixed(2) : '—'
    const p99 = 'mean' in measured ? String(measured.p99) : '—'
    return `The fault control passed the press bar (mean ${mean}, p99 ${p99}); a one-line shift must fail it.`
  }
  return undefined
}
