export const POINTS = /[\u0591-\u05c7]/g
export const BIDI_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

// Poppler reorders combining marks in RTL runs, so points are compared as a multiset and logical order
// without them. Its extractor also inserts bidi controls that format output but are not content.
// Single-point placement is held by eye checks outside the repository.
export const unpointed = (value: string): string => value.normalize('NFC').replace(POINTS, '').replace(BIDI_CONTROLS, '').replace(/\s+/g, '')

export const pointMultiset = (value: string): string =>
  [...value.normalize('NFC').matchAll(POINTS)]
    .map(([point]) => point)
    .sort()
    .join('')

export const text = (value: string): string => value.normalize('NFC').replace(/\s+/g, ' ').trim()

export function pointedLines(html: string): string[] {
  return [...html.matchAll(/<[^>]+\sdata-pointed(?:\s[^>]*)?>([^<]+)<\/[^>]+>/g)].map((match) => text(match[1] ?? ''))
}

export function fontRows(output: string): string[] {
  return output
    .split('\n')
    .slice(2)
    .map((line) => line.trim())
    .filter(Boolean)
}
