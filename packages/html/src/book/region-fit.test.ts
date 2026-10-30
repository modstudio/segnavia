import { describe, expect, test } from 'bun:test'
import { Book, type BookInput, PX_PER_PT } from '@segnavia/format'
import { bookDocument } from './book-document.ts'
import { templateRegionElements } from './book-held.ts'
import { ABSOLUTE_PX, ABSOLUTE_UNITS, fitRegionSize, lengthPx, parseCssLength, templateRegionFitIssues } from './region-fit.ts'

const chapter = (title: string, html = '<p>Text</p>') => ({ title, html })
const input = (overrides: Partial<BookInput> = {}): BookInput => ({
  title: 'Book',
  mode: 'paginated',
  page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
  chapters: [chapter('One')],
  ...overrides,
})

const issuesFor = (html: string) => templateRegionFitIssues('lesson', templateRegionElements(html))

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

  test('unusable inputs are marked unusable without measuring', () => {
    let n = 0
    const overflows = () => {
      n += 1
      return true
    }
    expect(fitRegionSize(48, 75, 1, overflows)).toEqual({ usable: false })
    expect(fitRegionSize(75, 48, 0, overflows)).toEqual({ usable: false })
    expect(fitRegionSize(Number.NaN, 48, 1, overflows)).toEqual({ usable: false })
    expect(n).toBe(0)
  })
})

describe('templateRegionFitIssues', () => {
  test('invalid attributes', () => {
    expect(
      issuesFor(
        [
          '<div data-region="heading" data-fit-min="wide" data-fit-step="1pt" style="font-size:75pt"></div>',
          '<div data-region="reading" data-fit-min="48pt" data-fit-step="0pt" style="font-size:75pt"></div>',
          '<div data-region="table" data-fit-min="48pt" style="font-size:75pt"></div>',
          '<div data-region="relative" data-fit-min="2em" data-fit-step="1pt" style="font-size:75pt"></div>',
          '<div data-region="negative" data-fit-min="-5pt" data-fit-step="1pt" style="font-size:75pt"></div>',
        ].join(''),
      ),
    ).toEqual([
      'template "lesson" region "heading" data-fit-min "wide" is not an absolute CSS length; use an absolute CSS length such as 48pt to clear this refusal',
      'template "lesson" region "reading" data-fit-step "0pt" is not a positive absolute CSS length; use a positive absolute CSS length such as 1pt to clear this refusal',
      'template "lesson" region "table" data-fit-step "" is not an absolute CSS length; use an absolute CSS length such as 1pt to clear this refusal',
      'template "lesson" region "relative" data-fit-min "2em" uses unit "em"; use an absolute CSS length (px, pt, pc, in, cm, mm or q) such as 48pt to clear this refusal',
      'template "lesson" region "negative" data-fit-min "-5pt" is not a positive absolute CSS length; use a positive absolute CSS length such as 48pt to clear this refusal',
    ])
  })

  test('a valid min and step are silent, including a min above an inline font-size', () => {
    expect(issuesFor('<div data-region="heading" data-fit-min="48pt" data-fit-step="1pt" style="font-size:75pt"></div>')).toEqual([])
    expect(issuesFor('<div data-region="heading" data-fit-min="80pt" data-fit-step="1pt" style="font-size:75pt"></div>')).toEqual([])
  })

  test('a value that smuggles a CSS declaration is not a length and cannot add a declaration', () => {
    const smuggled = '1px;background:url(https://example.invalid/x)'
    expect(parseCssLength(smuggled)).toBeUndefined()
    expect(lengthPx(smuggled, ABSOLUTE_PX)).toBeUndefined()
    expect(issuesFor(`<div data-region="heading" data-fit-min="${smuggled}" data-fit-step="1pt"></div>`)).toEqual([
      `template "lesson" region "heading" data-fit-min "${smuggled}" is not an absolute CSS length; use an absolute CSS length such as 48pt to clear this refusal`,
    ])
  })

  test('an absolute length converts through PX_PER_PT', () => {
    expect(lengthPx('48pt', ABSOLUTE_PX)).toBe(48 * PX_PER_PT)
    expect(lengthPx('75pt', ABSOLUTE_PX)).toBe(75 * PX_PER_PT)
  })

  test('ABSOLUTE_PX is keyed by ABSOLUTE_UNITS in docs order', () => {
    expect(ABSOLUTE_UNITS).toEqual(['px', 'pt', 'pc', 'in', 'cm', 'mm', 'q'])
    expect(Object.keys(ABSOLUTE_PX)).toEqual([...ABSOLUTE_UNITS])
  })

  test('bookDocument reports fit issues on the same path as other data-region checks', () => {
    const book = Book.parse(
      input({
        templates: [{ name: 'lesson', html: '<div data-region="heading" data-fit-min="bogus" data-fit-step="-1pt"></div>' }],
      }),
    )
    expect(bookDocument(book).issues).toEqual([
      'template "lesson" region "heading" data-fit-min "bogus" is not an absolute CSS length; use an absolute CSS length such as 48pt to clear this refusal',
      'template "lesson" region "heading" data-fit-step "-1pt" is not a positive absolute CSS length; use a positive absolute CSS length such as 1pt to clear this refusal',
    ])
  })

  test('bookDocument refuses an invalid nested fit value, naming the section, page, region, value and unit', () => {
    const book = Book.parse(
      input({
        templates: [{ name: 'lesson', html: '<div data-region="heading"></div>' }],
        chapters: [
          {
            kind: 'templated',
            title: 'Lessons',
            template: 'lesson',
            pages: [{ regions: { heading: '<div data-region="inner" data-fit-min="2em" data-fit-step="1pt"></div>' } }],
          },
        ],
      }),
    )
    expect(bookDocument(book).issues).toEqual([
      'section Lessons page 1 region "inner" data-fit-min "2em" uses unit "em"; use an absolute CSS length (px, pt, pc, in, cm, mm or q) such as 48pt to clear this refusal',
    ])
  })
})
