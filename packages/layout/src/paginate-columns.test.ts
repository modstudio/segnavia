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

test('flow edges include decoration that opens and closes on their lines', () => {
  const decorated = block('text', 'div', 1, 1, 2, 20)
  decorated.lines[0] = { top: 20, bottom: 30, decorationTop: 4 }
  decorated.lines[1] = { top: 30, bottom: 40, decorationBottom: 52 }
  const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [decorated])] })).pages
  expect(pages[0]?.windows).toEqual([win('c1', 4, 52, 0)])
})

test('an edge between decorated blocks is the midpoint of their decoration extents', () => {
  const first = block('text', 'div', 1, 1, 1, 0)
  const second = block('text', 'div', 1, 2, 1, 30, { breakBefore: true })
  first.lines[0] = { top: 0, bottom: 10, decorationBottom: 18 }
  second.lines[0] = { top: 30, bottom: 40, decorationTop: 22 }
  const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [first, second])] })).pages
  expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 20, 0)], [win('c1', 20, 40, -2)]])
})

test('an edge inside a decorated box remains the line midpoint', () => {
  const decorated = block('text', 'div', 1, 1, 2, 0)
  decorated.lines[0] = { top: 0, bottom: 10, decorationTop: -8 }
  decorated.lines[1] = { top: 10, bottom: 20, decorationBottom: 28 }
  const pages = paginateBook(input({ geometry: { textHeight: 18, notesGap: 10 }, flows: [flow('c1', 'chapter', [decorated])] })).pages
  expect(pages.map((page) => page.windows)).toEqual([[win('c1', -8, 10, 0)], [win('c1', 10, 28, 0)]])
})

test('closing decoration moves a last line that no longer fits to the next page', () => {
  const decorated = block('text', 'div', 1, 1, 2, 0)
  decorated.lines[1] = { top: 40, bottom: 50, decorationBottom: 58 }
  const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [decorated])] })).pages
  expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 25, 0)], [win('c1', 25, 58, -15)]])
})
