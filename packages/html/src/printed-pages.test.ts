import { describe, expect, test } from 'bun:test'
import { defaultPageNumbering, planPrintedPages } from './printed-pages.ts'

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
  })

  test('puts recto on the left in right-to-left and formats Hebrew numbers', () => {
    const pages = planPrintedPages({ every: 'body' }, 3, 'rtl', 'hebrew')
    expect(pages.map((page) => [page.side, page.number, page.total])).toEqual([
      ['left', 'א', 'ג'],
      ['right', 'ב', 'ג'],
      ['left', 'ג', 'ג'],
    ])
    expect(defaultPageNumbering('he-IL')).toBe('hebrew')
    expect(defaultPageNumbering('en')).toBe('arabic')
  })
})
