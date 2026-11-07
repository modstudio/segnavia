import { describe, expect, test } from 'bun:test'
import { bookPlanFolios } from './book-plan-folios.ts'
import { flow, input, settings } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'
import { planBook } from './plan-book.ts'

describe('planBook', () => {
  test.each([
    { name: 'left-to-right Arabic', direction: 'ltr' as const, frontMatter: 'roman-lower' as const, body: 'arabic' as const },
    { name: 'right-to-left Hebrew', direction: 'rtl' as const, frontMatter: 'hebrew' as const, body: 'hebrew' as const },
  ])('combines the existing pagination and folio plans for $name books', ({ direction, frontMatter, body }) => {
    const measurements = input({
      direction,
      flows: [flow('front', 'front', [], 'Front'), flow('body', 'chapter', [], 'Body')],
      settings,
    })
    const paginated = paginateBook(measurements)
    const folios = bookPlanFolios(paginated.pages, { frontMatter, body })
    expect(planBook(measurements, { frontMatter, body })).toEqual({
      ok: true,
      plan: { pages: paginated.pages, ...folios },
    })
  })
})
