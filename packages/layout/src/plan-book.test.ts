import { describe, expect, test } from 'bun:test'
import { bookPlanFolios } from './book-plan-folios.ts'
import { block, flow, input, settings } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'
import { planBook } from './plan-book.ts'

describe('planBook', () => {
  test.each([
    {
      name: 'left-to-right Arabic',
      direction: 'ltr' as const,
      frontMatter: 'roman-lower' as const,
      body: 'arabic' as const,
      expectedFolios: ['i', 'ii', '1'],
    },
    {
      name: 'right-to-left Hebrew',
      direction: 'rtl' as const,
      frontMatter: 'hebrew' as const,
      body: 'hebrew' as const,
      expectedFolios: ['א', 'ב', 'א'],
    },
  ])('combines the existing pagination and folio plans for $name books', ({ direction, frontMatter, body, expectedFolios }) => {
    const measurements = input({
      flows: [flow('front', 'front', [block('text', 'p', 0, 1, 1, 0)], 'Front'), flow('body', 'chapter', [block('text', 'p', 1, 1, 1, 0)], 'Body')],
      settings: { ...settings, direction },
    })
    const paginated = paginateBook(measurements)
    const folios = bookPlanFolios(paginated.pages, { frontMatter, body })
    const result = planBook(measurements, { frontMatter, body })
    expect(result).toEqual({
      ok: true,
      plan: { pages: paginated.pages, ...folios },
    })
    expect(result.ok && result.plan.folios).toEqual([...expectedFolios])
    expect(result.ok && result.plan.total).toBe(direction === 'ltr' ? '3' : 'ג')
  })

  test('returns pagination refusals instead of a partial plan', () => {
    const figure = block('figure', 'img', 1, 2, 1, 0, { columns: 2, lines: [{ top: 0, bottom: 80 }] })
    const result = planBook(input({ flows: [flow('c1', 'chapter', [figure])] }), { frontMatter: 'roman-lower', body: 'arabic' })
    expect(result).toEqual({
      ok: false,
      refusals: [
        {
          tag: 'img',
          position: { chapter: 1, block: 2 },
          message:
            'The img at chapter 1 block 2 could not establish a fit in the "segnavia:opener" opener parent\'s 50px text area; shorten it or increase the text-area height to clear this refusal.',
        },
      ],
    })
  })
})
