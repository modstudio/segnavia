import type { GoldenPdf } from './model.ts'

export interface GoldenDifference {
  field: string
  expected: unknown
  actual: unknown
}

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

export function firstGoldenDifference(expected: GoldenPdf, actual: GoldenPdf): GoldenDifference | undefined {
  if (expected.pages.length !== actual.pages.length) return { field: 'page count', expected: expected.pages.length, actual: actual.pages.length }
  for (let index = 0; index < expected.pages.length; index += 1) {
    const wanted = expected.pages[index]
    const found = actual.pages[index]
    if (!same(wanted?.size, found?.size)) return { field: `page ${index + 1} size`, expected: wanted?.size, actual: found?.size }
  }
  if (!same(expected.outline, actual.outline)) return { field: 'outline', expected: expected.outline, actual: actual.outline }
  for (let index = 0; index < expected.pages.length; index += 1) {
    const wanted = expected.pages[index]?.text
    const found = actual.pages[index]?.text
    if (wanted !== found) return { field: `page ${index + 1} text`, expected: wanted, actual: found }
  }
  if (!same(expected.fonts, actual.fonts)) return { field: 'embedded fonts', expected: expected.fonts, actual: actual.fonts }
  if (!same(expected.info, actual.info)) return { field: 'Info fields', expected: expected.info, actual: actual.info }
  if (expected.xmp !== actual.xmp) return { field: 'XMP fields', expected: expected.xmp, actual: actual.xmp }
}

export function goldenFailure(fixture: string, difference: GoldenDifference): string {
  return `${fixture}: ${difference.field} differs; expected ${JSON.stringify(difference.expected)}, actual ${JSON.stringify(difference.actual)}`
}
