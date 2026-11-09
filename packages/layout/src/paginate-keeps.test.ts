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

  test('a trailing heading without keep-with-next may end a page', () => {
    const pages = paginateBook(
      input({
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 4, 0), block('heading', 'h2', 1, 1, 1, 40), block('text', 'p', 1, 2, 2, 50)])],
      }),
    ).pages

    expect(pages[0]?.windows).toEqual([win('c1', 0, 50, 0)])
    expect(pages[1]?.windows).toEqual([win('c1', 50, 70, 0)])
  })

  test('headings at the end of a chapter stay on the page where they fit', () => {
    const pages = paginateBook(
      input({
        flows: [
          flow('c1', 'chapter', [
            block('text', 'p', 1, 0, 3, 0),
            block('heading', 'h2', 1, 1, 1, 30, { keepWithNext: true }),
            block('heading', 'h3', 1, 2, 1, 40, { keepWithNext: true }),
          ]),
        ],
      }),
    ).pages

    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 50, 0)])
  })

  test('a heading moves with a following block onto the next page', () => {
    const pages = paginateBook(
      input({
        flows: [
          flow('c1', 'chapter', [
            block('text', 'p', 1, 0, 4, -40),
            block('heading', 'h2', 1, 1, 1, 0, { keepWithNext: true }),
            block('text', 'p', 1, 2, 5, 10),
          ]),
        ],
      }),
    ).pages

    expect(pages[0]?.windows).toEqual([win('c1', -40, 0, 0)])
    expect(pages[1]?.windows[0]?.start).toBe(0)
  })

  test('a figure without keep-together splits by lines', () => {
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 3, 0), block('figure', 'figure', 1, 1, 4, 30)])] })).pages

    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 50, 0)], [win('c1', 50, 70, 0)]])
  })

  test('a list item keep run is never split across pages', () => {
    const list = block('text', 'ul', 1, 0, 6, 0, { keepRuns: [{ start: 2, end: 6 }] })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [list])] })).pages

    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 20, 0)], [win('c1', 20, 60, 0)]])
  })

  test('a nested tail heading moves with the next block while earlier container lines stay', () => {
    const container = block('text', 'section', 1, 1, 3, 20, { keepWithNext: true, keepWithNextFrom: 1 })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 2, 0), container, block('text', 'p', 1, 2, 2, 50)])] })).pages

    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 30, 0)], [win('c1', 30, 70, 0)]])
  })

  test('a whole-block keep-with-next still moves the entire block', () => {
    const pages = paginateBook(
      input({
        flows: [
          flow('c1', 'chapter', [block('text', 'p', 1, 0, 3, 0), block('heading', 'h2', 1, 1, 2, 30, { keepWithNext: true }), block('text', 'p', 1, 2, 2, 50)]),
        ],
      }),
    ).pages

    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 30, 0)], [win('c1', 30, 70, 0)]])
  })

  test('table keep runs break between rows and not inside a fitting row in both directions', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const table = block('table', 'table', 1, 1, 6, 40, {
        keepRuns: [
          { start: 0, end: 2 },
          { start: 2, end: 4 },
          { start: 4, end: 6 },
        ],
      })
      const pages = paginateBook(
        input({
          settings: { rectoOpenings: false, direction, endnotePlacement: 'book' },
          flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 4, 0), table])],
        }),
      ).pages

      expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 40, 0)], [win('c1', 40, 80, 0)], [win('c1', 80, 100, 0)]])
    }
  })

  test('a table without keep runs splits between any lines', () => {
    const table = block('table', 'table', 1, 1, 3, 40)
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 4, 0), table])] })).pages

    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 50, 0)], [win('c1', 50, 70, 0)]])
  })

  test('a table with keep-together that fits moves whole', () => {
    const table = block('table', 'table', 1, 1, 3, 30, { keepTogether: true })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 3, 0), table])] })).pages

    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 30, 0)], [win('c1', 30, 60, 0)]])
  })
})
