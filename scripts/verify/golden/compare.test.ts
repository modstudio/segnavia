import { describe, expect, test } from 'bun:test'
import { firstGoldenDifference, goldenFailure } from './compare.ts'
import type { GoldenPdf } from './model.ts'

const fixture = (): GoldenPdf => ({
  pages: [
    { size: [100, 200], text: 'folio ט״ו' },
    { size: [100, 200], text: 'body' },
  ],
  outline: [{ title: 'Chapter', page: 2, depth: 0 }],
  fonts: ['NotoSerifHebrew'],
  info: { Title: 'Book' },
  xmp: '<title>Book</title>',
})

describe('golden PDF comparison', () => {
  test.each([
    ['page count', (actual: GoldenPdf) => actual.pages.push({ size: [100, 200], text: '' })],
    ['page 1 text', (actual: GoldenPdf) => (actual.pages[0] = { ...(actual.pages[0] as GoldenPdf['pages'][number]), text: 'folio ט״ז' })],
    ['outline', (actual: GoldenPdf) => actual.outline.push({ title: 'Duplicate', page: 2, depth: 0 })],
  ])('names the fixture and first differing %s field', (field, mutate) => {
    const expected = fixture()
    const actual = structuredClone(expected)
    mutate(actual)
    const difference = firstGoldenDifference(expected, actual)
    expect(difference?.field).toBe(field)
    expect(goldenFailure('hebrew-sefer', difference as NonNullable<typeof difference>)).toStartWith(`hebrew-sefer: ${field} differs`)
  })
})
