import { type CssSanitizeResult, sanitizeCss } from './sanitize-css.ts'

export function sanitizeBookCss(fontCss: string | undefined, bookCss: string | undefined, hostCss: string | undefined): CssSanitizeResult {
  const sanitized = sanitizeCss(bookCss ?? '', false, false)
  return { css: `${fontCss ?? ''}${sanitized.css.replaceAll('<', '\\3c ')}${hostCss ?? ''}`, removed: sanitized.removed }
}
