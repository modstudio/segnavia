import { sanitizeCss } from './sanitize-css.ts'

export interface BookCssResult {
  css: string
  removed: string[]
}

export function sanitizeBookCss(css: string | undefined, dataFonts = false): BookCssResult {
  return sanitizeCss(css ?? '', false, dataFonts)
}
