import { type CssPreflightFinding, type CssSanitizeResult, sanitizeCss } from './sanitize-css.ts'

// A book's css sits in a <style> element, so every `<` is the CSS hex escape `\3c `.
export function sanitizeBookCss(css: string | undefined, preflight?: CssPreflightFinding[]): CssSanitizeResult {
  const sanitized = sanitizeCss(css ?? '', false, false, preflight)
  return { css: sanitized.css.replaceAll('<', '\\3c '), removed: sanitized.removed }
}
