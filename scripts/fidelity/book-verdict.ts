import { ACCEPTANCE_BARS } from './config.ts'
import type { DocumentResult, RegistrationMeasurement } from './types.ts'

export function pageCountRefusal(screenCount: number, pdfCount: number): string | undefined {
  if (screenCount === pdfCount) return undefined
  return `The book has ${screenCount} screen papers and ${pdfCount} PDF pages.`
}

export function bookPagesPass(pages: DocumentResult[]): boolean {
  return pages.every((page) => Object.values(page.bars).every((bar) => bar.passed))
}

export function failedBookBars(page: DocumentResult): string[] {
  return ACCEPTANCE_BARS.filter((bar) => page.bars[bar.id].applicable !== false && !page.bars[bar.id].passed).map((bar) => bar.title)
}

export function faultControlProvesShift(page: DocumentResult): boolean {
  return Boolean(page.faultControl) && !page.bars.registration.passed && page.bars.registration.measured !== undefined
}

function registrationNumbers(measured: RegistrationMeasurement | undefined): string {
  if (!measured) return 'missing'
  return `dy ${measured.dy}, nL1@0 ${measured.residual0.toFixed(4)}; dx ${measured.dx}, nL1@0 ${measured.residualX0.toFixed(4)}`
}

export function faultControlFailure(page: DocumentResult): string | undefined {
  if (!page.faultControl) return undefined
  if (page.bars.registration.measured === undefined) {
    return 'The fault control has no registration measurement; a working reader is required so the one-line shift can be judged.'
  }
  if (page.bars.registration.passed) {
    const measured = page.bars.registration.measured as RegistrationMeasurement
    return `The fault control passed the registration bar (${registrationNumbers(measured)}); a one-line shift must fail it.`
  }
  return undefined
}
