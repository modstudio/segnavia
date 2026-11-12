import { expect, test } from 'bun:test'
import { pageReferenceFolio } from './composer.ts'

test('refuses a page reference beyond the computed folios', () => {
  expect(
    pageReferenceFolio(
      'appendix',
      501,
      Array.from({ length: 500 }, (_, index) => ({ number: index + 1, text: String(index + 1), printed: true })),
      { folioPrints: Array.from({ length: 500 }, () => true), division: 'body', authored: true },
    ),
  ).toEqual({
    refusal: 'page reference target appendix lands on page 501, beyond the 500 computed folios; shorten the book to 500 pages or fewer to clear this refusal',
  })
})

test('renders no contents folio for an uncounted target', () => {
  const options = { folioPrints: [null, true], division: 'body' as const, authored: true }
  expect(pageReferenceFolio('cover', 1, [null, 'i'], options)).toEqual({ folio: '' })
  expect(pageReferenceFolio('contents', 2, [null, 'i'], options)).toEqual({ folio: 'i' })
})

test('refuses a page reference to an unprinted division and names its remedy', () => {
  expect(pageReferenceFolio('preface-topic', 1, [null], { folioPrints: [false], division: 'frontMatter', authored: true })).toEqual({
    refusal:
      'Page reference target preface-topic lands on a page whose number is not printed; point the reference at a printed page or set numbering.printed.frontMatter to true to clear this refusal.',
  })
  expect(pageReferenceFolio('preface-topic', 1, [null], { folioPrints: [false], division: 'frontMatter', authored: false })).toEqual({ folio: '' })
})
