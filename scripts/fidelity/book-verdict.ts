import { ACCEPTANCE_BARS } from './config.ts'
import { formatRegistration } from './registration.ts'
import type { DocumentResult, RegistrationMeasurement } from './types.ts'

export function pageCountRefusal(screenCount: number, pdfCount: number): string | undefined {
  if (screenCount === pdfCount) return undefined
  return `The book has ${screenCount} screen papers and ${pdfCount} PDF pages.`
}

export function failedBookBars(page: DocumentResult): string[] {
  return ACCEPTANCE_BARS.filter((bar) => page.bars[bar.id].applicable !== false && !page.bars[bar.id].passed).map((bar) => bar.title)
}

export function faultControlProvesShift(page: DocumentResult): boolean {
  return Boolean(page.faultControl) && !page.bars.registration.passed && page.bars.registration.measured !== undefined
}

export function faultControlFailure(page: DocumentResult): string | undefined {
  if (!page.faultControl) return undefined
  if (page.bars.registration.passed) {
    const measured = page.bars.registration.measured as RegistrationMeasurement
    return `The fault control passed the registration bar (${formatRegistration(measured)}); a one-line shift must fail it.`
  }
  return undefined
}
