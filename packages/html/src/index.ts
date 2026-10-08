// HTML as authors write it for pages and slides: the active-content rule, the
// attribute bindings, and the one classification both follow from.

import { hasBindings } from './bindings.ts'
import { elements, parse } from './sanitize.ts'

export { BINDINGS, bindingNames, type Filled, type FillOptions, fill, hasBindings } from './bindings.ts'
export { findActiveContent, REFUSED_ELEMENTS, type SanitizeOptions, sanitize } from './sanitize.ts'

// How a page runs, decided only by what it holds: plain, filled from data,
// running its own code, or both, which is refused.
export type HtmlKind = 'plain' | 'live-data' | 'scripted' | 'refused'

export function classify(html: string, prefix: string): HtmlKind {
  const scripted = elements(parse(html).children).some((element) => element.name.toLowerCase() === 'script')
  const bound = hasBindings(html, prefix)
  if (scripted && bound) return 'refused'
  if (scripted) return 'scripted'
  return bound ? 'live-data' : 'plain'
}

// The text a search reads: what a person sees, without markup, styles or code.
export function searchText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
