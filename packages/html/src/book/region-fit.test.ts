import { describe, expect, test } from 'bun:test'
import { Book, type BookInput } from '@segnavia/format'
import { bookDocument } from './book-document.ts'
import { fitRegionSize, templateRegionFitIssues } from './region-fit.ts'

const chapter = (title: string, html = '<p>Text</p>') => ({ title, html })
const input = (overrides: Partial<BookInput> = {}): BookInput => ({
  title: 'Book',
  mode: 'paginated',
  page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
  chapters: [chapter('One')],
  ...overrides,
})

describe('fitRegionSize', () => {
  test('fits at max (no change)', () => {
    expect(fitRegionSize(75, 48, 1, () => false)).toEqual({ size: 75, overflow: false })
  })

  test('fits after stepping', () => {
    expect(fitRegionSize(75, 48, 1, (size) => size > 60)).toEqual({ size: 60, overflow: false })
  })

  test('overflows at min', () => {
    expect(fitRegionSize(75, 48, 1, () => true)).toEqual({ size: 48, overflow: true })
  })

  test('stops on the last step at or above min', () => {
    expect(fitRegionSize(75, 48, 2, () => true)).toEqual({ size: 49, overflow: true })
  })

  test('searches the step grid rather than one layout per step', () => {
    let n = 0
    fitRegionSize(75, 48, 1, (size) => {
      n += 1
      return size > 60
    })
    expect(n).toBeLessThan(10)
  })
})

describe('templateRegionFitIssues', () => {
  test('invalid attributes', () => {
    expect(
      templateRegionFitIssues([
        {
          name: 'lesson',
          html: [
            '<div data-region="heading" data-fit-min="wide" data-fit-step="1pt" style="font-size:75pt"></div>',
            '<div data-region="reading" data-fit-min="48pt" data-fit-step="0pt" style="font-size:75pt"></div>',
            '<div data-region="table" data-fit-min="48pt" style="font-size:75pt"></div>',
            '<div data-region="large" data-fit-min="80pt" data-fit-step="1pt" style="font-size:75pt"></div>',
          ].join(''),
        },
      ]),
    ).toEqual([
      'template "lesson" region "heading" data-fit-min "wide" is not a CSS length; use a CSS length such as 48pt to clear this refusal',
      'template "lesson" region "reading" data-fit-step "0pt" is not a positive CSS length; use a positive CSS length such as 1pt to clear this refusal',
      'template "lesson" region "table" data-fit-step "" is not a positive CSS length; use a positive CSS length such as 1pt to clear this refusal',
      'template "lesson" region "large" data-fit-min "80pt" is above the authored font size 75pt; lower the minimum or raise the region\'s font-size to clear this refusal',
    ])
  })

  test('a valid min and step against an authored size are silent', () => {
    expect(
      templateRegionFitIssues([{ name: 'lesson', html: '<div data-region="heading" data-fit-min="48pt" data-fit-step="1pt" style="font-size:75pt"></div>' }]),
    ).toEqual([])
  })

  test('bookDocument reports fit issues on the same path as other data-region checks', () => {
    const book = Book.parse(
      input({
        templates: [{ name: 'lesson', html: '<div data-region="heading" data-fit-min="bogus" data-fit-step="-1pt"></div>' }],
      }),
    )
    expect(bookDocument(book).issues).toEqual([
      'template "lesson" region "heading" data-fit-min "bogus" is not a CSS length; use a CSS length such as 48pt to clear this refusal',
      'template "lesson" region "heading" data-fit-step "-1pt" is not a positive CSS length; use a positive CSS length such as 1pt to clear this refusal',
    ])
  })
})
