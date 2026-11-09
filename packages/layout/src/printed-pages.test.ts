import { describe, expect, test } from 'bun:test'
import { BOOK_PARENT_NAMES, defaultPageNumbering } from '@segnavia/format'
import { pageFace, planBookPages, planPrintedPages } from './printed-pages.ts'

describe('planPrintedPages', () => {
  const rules = [
    { when: { position: 'documentFirst' as const }, parent: 'opening' },
    { when: { position: 'documentLast' as const }, parent: 'ending' },
    { when: { face: 'recto' as const }, parent: 'odd' },
    { when: { face: 'verso' as const }, parent: 'even' },
    { parent: 'body' },
  ]

  test('applies first, last, face and default precedence', () => {
    expect(planPrintedPages(rules, 4, 'ltr').map(({ parent, side }) => ({ parent, side }))).toEqual([
      { parent: 'opening', side: 'right' },
      { parent: 'even', side: 'left' },
      { parent: 'odd', side: 'right' },
      { parent: 'ending', side: 'left' },
    ])
    expect(planPrintedPages(rules, 1, 'ltr')[0]?.parent).toBe('opening')
  })

  test('puts recto on the left in right-to-left and formats Hebrew numbers', () => {
    const pages = planPrintedPages([{ parent: 'body' }], 3, 'rtl', 'hebrew')
    expect(pages.map((page) => [page.side, page.number, page.total])).toEqual([
      ['left', 'א', 'ג'],
      ['right', 'ב', 'ג'],
      ['left', 'ג', 'ג'],
    ])
    expect(defaultPageNumbering('he-IL')).toBe('hebrew')
    expect(defaultPageNumbering('iw-IL')).toBe('hebrew')
    expect(defaultPageNumbering('en')).toBe('arabic')
  })

  test('keeps faces independent of physical direction', () => {
    expect([pageFace(1, 'ltr'), pageFace(2, 'ltr'), pageFace(1, 'rtl'), pageFace(2, 'rtl')]).toEqual([
      { face: 'recto', side: 'right' },
      { face: 'verso', side: 'left' },
      { face: 'recto', side: 'left' },
      { face: 'verso', side: 'right' },
    ])
  })
})

describe('planBookPages', () => {
  test('preserves each role default without an explicit rule list', () => {
    const pages = planBookPages(
      [
        { blank: false, sectionOpening: true, folio: 'i', runningHead: 'Front' },
        { blank: false, sectionOpening: true, folio: 'ii', runningHead: 'Template', role: 'body' },
        { blank: true, sectionOpening: false, role: 'fixed' },
        { blank: false, sectionOpening: false, role: 'fixed' },
      ],
      'ltr',
    )
    expect(pages.map(({ role, parent }) => ({ role, parent }))).toEqual([
      { role: 'opener', parent: BOOK_PARENT_NAMES.opener },
      { role: 'verso', parent: BOOK_PARENT_NAMES.verso },
      { role: 'blank', parent: BOOK_PARENT_NAMES.blank },
      { role: 'fixed', parent: BOOK_PARENT_NAMES.blank },
    ])
  })
})
