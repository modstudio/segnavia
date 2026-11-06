import { describe, expect, test } from 'bun:test'
import { bookPlanFolios } from './book-plan-folios.ts'

describe('bookPlanFolios', () => {
  test('restarts in the body system while totaling all pages in that system', () => {
    expect(
      bookPlanFolios([{ sequence: 'front' }, { sequence: 'front' }, { sequence: 'body' }, { sequence: 'body' }], {
        frontMatter: 'roman-lower',
        body: 'hebrew',
      }),
    ).toEqual({ folios: ['i', 'ii', 'א', 'ב'], total: 'ד' })
  })

  test('keeps the previous empty-plan total', () => {
    expect(bookPlanFolios([], { frontMatter: 'roman-lower', body: 'hebrew' })).toEqual({ folios: [], total: '0' })
  })
})
