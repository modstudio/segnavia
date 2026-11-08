import { expect, test } from 'bun:test'
import { block, flow, input } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

test('carries section-title marks across pages and takes the first new title on a shared page', () => {
  const title = 'segnavia:section-title'
  const pages = paginateBook(
    input({
      flows: [
        flow('shared', 'chapter', [
          block('text', 'div', 1, 1, 1, 0, { marks: [{ name: title, value: 'One', line: 0 }] }),
          block('text', 'p', 1, 2, 7, 10),
          block('text', 'div', 2, 3, 1, 80, { marks: [{ name: title, value: 'Two', line: 0 }] }),
          block('text', 'p', 2, 4, 7, 90),
        ]),
      ],
    }),
  ).pages
  expect(pages.map((page) => page.marks?.[title]?.first)).toEqual(['One', 'Two', 'Two', 'Two'])
})
