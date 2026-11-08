import { expect, test } from 'bun:test'
import { block, flow, input } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

test('starts a new page before a forced-break block', () => {
  const result = paginateBook(
    input({
      flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 2, 0), block('text', 'p', 1, 2, 2, 30, { id: 'second', breakBefore: true })])],
    }),
  )
  expect(result.refusals).toEqual([])
  expect(result.pages).toHaveLength(2)
  expect(result.pages.map((page) => page.windows[0]?.start)).toEqual([0, 25])
})
