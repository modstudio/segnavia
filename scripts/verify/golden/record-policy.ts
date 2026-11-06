import type { GoldenPdf } from './model.ts'

export function assertGoldenRecordable(fixture: string, golden: GoldenPdf): void {
  if (golden.fonts.length === 0 && golden.pages.some((page) => page.text.trim().length > 0)) {
    throw new Error(`${fixture}: text-bearing pages reported no embedded fonts; record from the Ubuntu CI demo artifact after pdffonts reports embedded fonts.`)
  }
}
