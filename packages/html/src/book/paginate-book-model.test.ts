import { describe, expect, test } from 'bun:test'
import { block, flow, input, settings, win } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

describe('paginateBook model', () => {
  test('uses the opener height only for the opening page', () => {
    const sample = input({ flows: [{ ...flow('c1', 'chapter', [block('text', 'p', 1, 1, 11, 0)]), parents: { opener: 'deep' } }] })
    sample.parents.deep = { width: 100, height: 30 }

    const pages = paginateBook(sample).pages

    expect(pages.map((page) => page.windows[0] && (page.windows[0].end - page.windows[0].start) / 10)).toEqual([3, 5, 3])
    expect(pages.map((page) => page.parent)).toEqual(['deep', 'segnavia:verso', 'segnavia:recto'])
  })

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

  test('adjacent two-column blocks merge into one balanced run', () => {
    const pages = paginateBook(
      input({
        geometry: { textHeight: 200, notesGap: 10 },
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 4, 0, { columns: 2 }), block('text', 'p', 1, 2, 4, 40, { columns: 2 })])],
      }),
    ).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 40, 0, 0, 2), win('c1', 40, 80, 0, 1, 2)])
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

  test('galley gaps between blocks survive on the page', () => {
    const pages = paginateBook(
      input({
        geometry: { textHeight: 200, notesGap: 10 },
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 3, 0), block('text', 'p', 1, 1, 4, 50, { columns: 2 }), block('text', 'p', 1, 2, 2, 120)])],
      }),
    ).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 40, 0), win('c1', 40, 70, 40, 0, 2), win('c1', 70, 105, 50, 1, 2), win('c1', 105, 140, 85)])
  })

  test('overlapping line rects keep a negative galley gap', () => {
    const pages = paginateBook(
      input({
        geometry: { textHeight: 200, notesGap: 10 },
        flows: [
          flow('c1', 'chapter', [
            block('text', 'p', 1, 0, 1, 0, { lines: [{ top: 0, bottom: 20 }] }),
            block('text', 'p', 1, 1, 2, 10, {
              columns: 2,
              lines: [
                { top: 10, bottom: 20 },
                { top: 20, bottom: 30 },
              ],
            }),
            block('text', 'p', 1, 2, 1, 22, { lines: [{ top: 22, bottom: 32 }] }),
          ]),
        ],
      }),
    ).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 15, 0), win('c1', 15, 20, 15, 0, 2), win('c1', 20, 26, 10, 1, 2), win('c1', 26, 32, 16)])
  })

  test('a front-sequence fixed flow appears among the front pages', () => {
    const pages = paginateBook(
      input({
        settings,
        flows: [
          flow('preface', 'front', [block('text', 'p', 0, 1, 2, 0)]),
          { id: 'dedication', kind: 'fixed', pages: 2, sequence: 'front' },
          flow('toc', 'contents', [block('text', 'p', 0, 2, 2, 0)]),
          flow('c1', 'chapter', [block('text', 'p', 1, 1, 3, 0)]),
        ],
      }),
    ).pages
    expect(pages.map((page) => ({ role: page.role, sequence: page.sequence, flow: page.flow, number: page.number, kind: page.kind }))).toEqual([
      { role: 'opener', sequence: 'front', flow: 'preface', number: 1, kind: 'front' },
      { role: 'blank', sequence: 'front', flow: 'dedication', number: 2, kind: 'blank' },
      { role: 'fixed', sequence: 'front', flow: 'dedication', number: 3, kind: 'front' },
      { role: 'fixed', sequence: 'front', flow: 'dedication', number: 4, kind: 'front' },
      { role: 'opener', sequence: 'front', flow: 'toc', number: 5, kind: 'front' },
      { role: 'blank', sequence: 'front', flow: 'toc', number: 6, kind: 'blank' },
      { role: 'opener', sequence: 'body', flow: 'c1', number: 1, kind: 'body' },
    ])
  })

  test('marks named __proto__ and constructor leave Object.prototype untouched', () => {
    const beforeLast = Object.getOwnPropertyDescriptor(Object.prototype, 'last')
    const beforeFirst = Object.getOwnPropertyDescriptor(Object.prototype, 'first')
    const pages = paginateBook(
      input({
        flows: [
          flow('c1', 'chapter', [
            block('text', 'p', 1, 1, 2, 0, {
              marks: [
                { name: '__proto__', value: 'P', line: 0 },
                { name: 'constructor', value: 'C', line: 1 },
              ],
            }),
          ]),
        ],
      }),
    ).pages
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'last')).toEqual(beforeLast)
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'first')).toEqual(beforeFirst)
    expect(Object.prototype).not.toHaveProperty('last')
    const marks = pages[0]?.marks
    expect(marks ? Object.getOwnPropertyDescriptor(marks, '__proto__')?.value : undefined).toEqual({ first: 'P', last: 'P' })
    expect(marks ? Object.getOwnPropertyDescriptor(marks, 'constructor')?.value : undefined).toEqual({ first: 'C', last: 'C' })
  })

  test('a block with more than 12 columns is refused by name', () => {
    const result = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 2, 0, { columns: 13 })])] }))
    expect(result.pages).toEqual([])
    expect(result.refusals).toEqual([
      {
        tag: 'p',
        position: { chapter: 1, block: 1 },
        message: 'The p at chapter 1 block 1 could not establish a column count; use an integer from 1 to 12 to clear this refusal.',
      },
    ])
  })

  test('a fixed flow with a non-finite page count is refused by name', () => {
    const result = paginateBook(input({ flows: [{ id: 'art', kind: 'fixed', pages: Number.POSITIVE_INFINITY }] }))
    expect(result.pages).toEqual([])
    expect(result.refusals).toEqual([
      {
        flow: 'art',
        message: 'The art flow could not establish a page count; use a safe integer of 0 or more to clear this refusal.',
      },
    ])
  })
})
