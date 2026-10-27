import { describe, expect, test } from 'bun:test'
import { BOOK_PARENT_NAMES, defaultPageNumbering } from '@segnavia/format'
import { planBookPages, planPrintedPages, printedPageAt } from './printed-pages.ts'

describe('planPrintedPages', () => {
  const rules = { every: 'body', first: 'opening', last: 'ending', recto: 'odd', verso: 'even' }

  test('applies first, last, side and every precedence', () => {
    expect(planPrintedPages(rules, 4, 'ltr').map(({ role, parent, side }) => ({ role, parent, side }))).toEqual([
      { role: 'first', parent: 'opening', side: 'right' },
      { role: 'verso', parent: 'even', side: 'left' },
      { role: 'recto', parent: 'odd', side: 'right' },
      { role: 'last', parent: 'ending', side: 'left' },
    ])
    expect(planPrintedPages(rules, 1, 'ltr')[0]?.parent).toBe('opening')
    for (const direction of ['ltr', 'rtl'] as const) {
      for (let count = 1; count <= 5; count += 1) {
        expect(planPrintedPages(rules, count, direction).map(({ role, parent, side }) => ({ role, parent, side }))).toEqual(
          Array.from({ length: count }, (_, index) => printedPageAt(rules, index + 1, count, direction)),
        )
      }
    }
  })

  test('puts recto on the left in right-to-left and formats Hebrew numbers', () => {
    const pages = planPrintedPages({ every: 'body' }, 3, 'rtl', 'hebrew')
    expect(pages.map((page) => [page.side, page.number, page.total])).toEqual([
      ['left', 'א', 'ג'],
      ['right', 'ב', 'ג'],
      ['left', 'ג', 'ג'],
    ])
    expect(defaultPageNumbering('he-IL')).toBe('hebrew')
    expect(defaultPageNumbering('iw-IL')).toBe('hebrew')
    expect(defaultPageNumbering('en')).toBe('arabic')
  })
})

describe('planBookPages', () => {
  test('gives blanks and section openings precedence over physical-page parity', () => {
    const pages = planBookPages(
      [
        { blank: false, sectionOpening: true, folio: 'i', runningHead: 'Front' },
        { blank: false, sectionOpening: false, folio: 'ii', runningHead: 'Front' },
        { blank: true, sectionOpening: false, folio: 'iii', runningHead: 'Front' },
        { blank: false, sectionOpening: false, folio: 'iv', runningHead: 'Next' },
      ],
      'ltr',
    )

    expect(pages).toEqual([
      { index: 1, role: 'opener', parent: BOOK_PARENT_NAMES.opener, side: 'right', folio: 'i' },
      { index: 2, role: 'verso', parent: BOOK_PARENT_NAMES.verso, side: 'left', folio: 'ii', runningHead: 'Front' },
      { index: 3, role: 'blank', parent: BOOK_PARENT_NAMES.blank, side: 'right' },
      { index: 4, role: 'verso', parent: BOOK_PARENT_NAMES.verso, side: 'left', folio: 'iv', runningHead: 'Next' },
    ])
  })

  test('puts odd physical pages on the left for right-to-left books', () => {
    const pages = planBookPages(
      [
        { blank: false, sectionOpening: false, folio: 'א', runningHead: 'ראשון' },
        { blank: false, sectionOpening: false, folio: 'ב', runningHead: 'ראשון' },
      ],
      'rtl',
    )
    expect(pages.map(({ role, side }) => ({ role, side }))).toEqual([
      { role: 'recto', side: 'left' },
      { role: 'verso', side: 'right' },
    ])
  })

  test('selects a section parent per role and side, then the book default', () => {
    const named = { opener: 's-opener', recto: 's-recto', verso: 's-verso', blank: 's-blank', fixed: 's-fixed' }
    const pages = planBookPages(
      [
        { blank: false, sectionOpening: true, folio: '1', parents: named },
        { blank: false, sectionOpening: false, folio: '2', runningHead: 'Body', parents: named },
        { blank: false, sectionOpening: false, folio: '3', runningHead: 'Body', parents: named },
        { blank: true, sectionOpening: false, parents: named },
        { blank: false, sectionOpening: true, folio: '5', role: 'fixed', parents: named },
        { blank: false, sectionOpening: false, folio: '6', role: 'fixed' },
      ],
      'ltr',
    )
    expect(pages.map(({ role, parent }) => ({ role, parent }))).toEqual([
      { role: 'opener', parent: 's-opener' },
      { role: 'verso', parent: 's-verso' },
      { role: 'recto', parent: 's-recto' },
      { role: 'blank', parent: 's-blank' },
      { role: 'fixed', parent: 's-fixed' },
      { role: 'fixed', parent: BOOK_PARENT_NAMES.blank },
    ])
  })
})
