import { expect, test } from 'bun:test'
import { block, flow, input, win } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

test('header repeat follows measured header height without a table kind', () => {
  const measuredHeader = block('text', 'div', 1, 1, 6, 0, { headerHeight: 10 })
  const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [measuredHeader])] })).pages
  expect(pages.map((page) => ({ window: page.windows[0], header: page.headerRepeat }))).toEqual([
    { window: win('c1', 0, 50, 0), header: undefined },
    { window: win('c1', 50, 60, 10), header: 10 },
  ])
})
