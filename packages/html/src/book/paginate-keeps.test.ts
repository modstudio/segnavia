import { describe, expect, test } from 'bun:test'
import { block, flow, input, win } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

describe('paginateKeeps', () => {
  test('a trailing keep-with-next block stays on the page where it fits', () => {
    const pages = paginateBook(
      input({
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 4, 0), block('text', 'p', 1, 1, 1, 40, { keepWithNext: true })])],
      }),
    ).pages

    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 50, 0)])
  })

  test('a trailing heading stays on the page where it fits', () => {
    const pages = paginateBook(
      input({
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 3, 0), block('heading', 'h2', 1, 1, 1, 30)])],
      }),
    ).pages

    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 40, 0)])
  })

  test('headings at the end of a chapter stay on the page where they fit', () => {
    const pages = paginateBook(
      input({
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 3, 0), block('heading', 'h2', 1, 1, 1, 30), block('heading', 'h3', 1, 2, 1, 40)])],
      }),
    ).pages

    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 50, 0)])
  })

  test('a heading moves with a following block onto the next page', () => {
    const pages = paginateBook(
      input({
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 4, -40), block('heading', 'h2', 1, 1, 1, 0), block('text', 'p', 1, 2, 5, 10)])],
      }),
    ).pages

    expect(pages[0]?.windows).toEqual([win('c1', -40, 0, 0)])
    expect(pages[1]?.windows[0]?.start).toBe(0)
  })
})
