import { describe, expect, test } from 'bun:test'
import { block, flow, input } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

// A forced break starts a page before its block, and never adds a page when the block already opens one.
describe('paginateBook forced breaks', () => {
  test('breakBefore starts a new page before a block in the middle of a page', () => {
    const blocks = [block('text', 'p', 1, 1, 2, 0), block('text', 'p', 1, 2, 2, 20, { breakBefore: true })]
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', blocks)] })).pages
    expect(pages.map((page) => page.windows[0]?.start)).toEqual([0, 20])
  })

  test('breakBefore on a section opening does not add a page', () => {
    const opening = block('text', 'p', 1, 1, 2, 0, { breakBefore: true })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [opening])] })).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.sectionOpening).toBe(true)
  })

  test('breakBefore after a natural page break does not add an empty page', () => {
    const blocks = [block('text', 'p', 1, 1, 5, 0), block('text', 'p', 1, 2, 2, 50, { breakBefore: true })]
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', blocks)] })).pages
    expect(pages).toHaveLength(2)
    expect(pages.map((page) => page.windows[0]?.start)).toEqual([0, 50])
  })
})
