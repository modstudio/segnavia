import { describe, expect, test } from 'bun:test'
import { paginateBook } from './paginate-book.ts'
import type { PaginateBlock, PaginateBookInput, PaginateFlow, PaginateWindow } from './paginate-types.ts'

const lineHeight = 10

function lines(count: number, start = 0, height = lineHeight) {
  return Array.from({ length: count }, (_, index) => ({ top: start + index * height, bottom: start + (index + 1) * height }))
}

function block(
  kind: PaginateBlock['kind'],
  tag: string,
  chapter: number,
  index: number,
  count: number,
  start: number,
  extra: Partial<PaginateBlock> = {},
): PaginateBlock {
  return { kind, tag, position: { chapter, block: index }, lines: lines(count, start), ...extra }
}

function flow(id: string, kind: Exclude<PaginateFlow['kind'], 'fixed'>, blocks: PaginateBlock[], runningHead?: string): PaginateFlow {
  return { id, kind, blocks, ...(runningHead === undefined ? {} : { runningHead }) }
}

function input(overrides: Partial<PaginateBookInput> & Pick<PaginateBookInput, 'flows'>): PaginateBookInput {
  return {
    notes: [],
    geometry: { textHeight: 50, notesGap: 10 },
    settings: {
      rectoOpenings: false,
      direction: 'ltr',
      sequences: { frontMatter: 'roman-lower', body: 'arabic' },
      endnotePlacement: 'book',
    },
    ...overrides,
  }
}

function win(id: string, start: number, end: number, top: number, column = 0, columns = 1): PaginateWindow {
  return { flow: id, start, end, top, column, columns }
}

const settings = {
  rectoOpenings: true as const,
  direction: 'ltr' as const,
  sequences: { frontMatter: 'roman-lower' as const, body: 'arabic' as const },
  endnotePlacement: 'book' as const,
}

describe('paginateBook model', () => {
  test('a two-column run is balanced on one page', () => {
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 6, 0, { columns: 2 })])] })).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 30, 0, 0, 2), win('c1', 30, 60, 0, 1, 2)])
  })

  test('a column run split across a page break is balanced on both pages', () => {
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0, { columns: 2 })])] })).pages
    expect(pages.map((page) => page.windows)).toEqual([
      [win('c1', 0, 50, 0, 0, 2), win('c1', 50, 100, 0, 1, 2)],
      [win('c1', 100, 110, 0, 0, 2), win('c1', 110, 120, 0, 1, 2)],
    ])
  })

  test('full-width and column runs alternate on one page with stacked tops', () => {
    const pages = paginateBook(
      input({
        geometry: { textHeight: 100, notesGap: 10 },
        flows: [
          flow('c1', 'chapter', [
            block('heading', 'h2', 1, 1, 1, 0),
            block('text', 'p', 1, 2, 6, 10, { columns: 2 }),
            block('heading', 'h2', 1, 3, 1, 70),
            block('text', 'p', 1, 4, 4, 80, { columns: 2 }),
          ]),
        ],
      }),
    ).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([
      win('c1', 0, 10, 0),
      win('c1', 10, 40, 10, 0, 2),
      win('c1', 40, 70, 10, 1, 2),
      win('c1', 70, 80, 40),
      win('c1', 80, 100, 50, 0, 2),
      win('c1', 100, 120, 50, 1, 2),
    ])
  })

  test('per-block orphans and widows override the settings', () => {
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 11, 0, { orphans: 3, widows: 3 })])] })).pages
    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 50, 0)], [win('c1', 50, 80, 0)], [win('c1', 80, 110, 0)]])
  })

  test('keepTogether on an oversized block splits instead of refusing', () => {
    const result = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 8, 0, { keepTogether: true })])] }))
    expect(result.refusals).toEqual([])
    expect(result.pages.map((page) => page.windows)).toEqual([[win('c1', 0, 50, 0)], [win('c1', 50, 80, 0)]])
  })

  test('marks first and last on a page, and carried to a page with none', () => {
    const paragraph = block('text', 'p', 1, 1, 12, 0, {
      marks: [
        { name: 'siman', value: 'A', line: 0 },
        { name: 'siman', value: 'B', line: 4 },
        { name: 'kavana', value: 'K', line: 2 },
      ],
    })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [paragraph])] })).pages
    expect(pages[0]?.marks).toEqual({ siman: { first: 'A', last: 'B' }, kavana: { first: 'K', last: 'K' } })
    expect(pages[1]?.marks).toEqual({ siman: { first: 'B', last: 'B' }, kavana: { first: 'K', last: 'K' } })
    expect(pages[2]?.marks).toEqual({ siman: { first: 'B', last: 'B' }, kavana: { first: 'K', last: 'K' } })
  })

  test('a fixed flow occupies whole pages and opens on a recto', () => {
    const pages = paginateBook(
      input({
        settings,
        flows: [
          flow('c1', 'chapter', [block('text', 'p', 1, 1, 3, 0)], 'One'),
          { id: 'art', kind: 'fixed', pages: 2 },
          flow('c2', 'chapter', [block('text', 'p', 2, 1, 3, 0)], 'Two'),
        ],
      }),
    ).pages
    expect(pages.map((page) => ({ role: page.role, number: page.number, flow: page.flow, blank: page.blank, opener: page.sectionOpening }))).toEqual([
      { role: 'opener', number: 1, flow: 'c1', blank: false, opener: true },
      { role: 'blank', number: 2, flow: 'art', blank: true, opener: false },
      { role: 'fixed', number: 3, flow: 'art', blank: false, opener: true },
      { role: 'fixed', number: 4, flow: 'art', blank: false, opener: false },
      { role: 'opener', number: 5, flow: 'c2', blank: false, opener: true },
    ])
  })

  test('output pages report roles and flow ids', () => {
    const pages = paginateBook(input({ settings, flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0)], 'One')] })).pages
    expect(pages.map((page) => ({ role: page.role, flow: page.flow, sequence: page.sequence }))).toEqual([
      { role: 'opener', flow: 'c1', sequence: 'body' },
      { role: 'body', flow: 'c1', sequence: 'body' },
      { role: 'body', flow: 'c1', sequence: 'body' },
    ])
  })

  test('a column run whose single line is taller than the text area is refused by name', () => {
    const result = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 1, 0, { columns: 2, lines: [{ top: 0, bottom: 80 }] })])] }))
    expect(result.pages).toEqual([])
    expect(result.refusals[0]?.tag).toBe('p')
  })

  test('blanks carry no marks', () => {
    const pages = paginateBook(
      input({
        settings,
        flows: [
          flow('c1', 'chapter', [block('text', 'p', 1, 1, 3, 0, { marks: [{ name: 'siman', value: 'A', line: 0 }] })]),
          flow('c2', 'chapter', [block('text', 'p', 2, 1, 3, 0)]),
        ],
      }),
    ).pages
    expect(pages[1]?.blank).toBe(true)
    expect(pages[1]?.marks).toBeUndefined()
    expect(pages[2]?.marks).toEqual({ siman: { first: 'A', last: 'A' } })
  })
})
