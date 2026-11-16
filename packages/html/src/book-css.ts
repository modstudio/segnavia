import { type CssPreflightFinding, sanitizeCss } from './sanitize-css.ts'

export interface BookCssSanitizeResult {
  css: string
  removed: string[]
}

// A book's css sits in a <style> element, so every `<` is the CSS hex escape `\3c `.
export function sanitizeBookCss(css: string | undefined, preflight?: CssPreflightFinding[], definitions?: ReadonlySet<string>): BookCssSanitizeResult {
  const sanitized = sanitizeCss(css ?? '', false, false, preflight, definitions)
  return { css: sanitized.css.replaceAll('<', '\\3c '), removed: [...new Set(sanitized.removed.map(({ label }) => label))] }
}
