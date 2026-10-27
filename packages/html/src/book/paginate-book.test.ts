import { describe, expect, test } from 'bun:test'
import { block, flow, input, note, settings, win } from './paginate-book.test-helper.ts'
import { paginateBook, paginateScript } from './paginate-book.ts'
import type { PaginateBookInput } from './paginate-types.ts'

function rebuilt() {
  return new Function(`${paginateScript()}; return paginateBook;`)() as typeof paginateBook
}

function fixtures(): PaginateBookInput[] {
  return [
    input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0)], 'One')] }),
    input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 8, 0, { footnoteRefs: [{ note: 'n1', line: 5 }] })])], notes: [note('n1', 3)] }),
    input({
      geometry: { textHeight: 50, notesGap: 10 },
      flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 2, 0, { footnoteRefs: [{ note: 'n1', line: 1 }] })])],
      notes: [note('n1', 6)],
    }),
    input({
      settings: {
        ...settings,
        rectoOpenings: false,
        direction: 'rtl',
        endnotePlacement: 'chapter',
        orphans: 2,
        widows: 2,
      },
      notes: [note('n1', 5)],
      flows: [
        flow('toc', 'contents', [block('text', 'p', 0, 1, 2, 0)]),
        flow('c1', 'chapter', [block('heading', 'h2', 1, 1, 1, 0), block('text', 'p', 1, 2, 6, 10, { footnoteRefs: [{ note: 'n1', line: 2 }] })], 'א'),
        flow('c2', 'chapter', [block('table', 'table', 2, 1, 8, 0, { headerHeight: 10 })], 'ב'),
        { id: 'spread', kind: 'fixed', pages: 2, parents: { opener: 'ornament' } },
        flow('c3', 'chapter', [
          block('text', 'p', 3, 1, 6, 0, {
            columns: 2,
            marks: [
              { name: 'siman', value: 'A', line: 0 },
              { name: 'siman', value: 'B', line: 5 },
            ],
          }),
        ]),
      ],
    }),
    input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 6, 0, { columns: 2 })])] }),
    input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0, { columns: 2 })])] }),
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
    input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 11, 0, { orphans: 3, widows: 3 })])] }),
    input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 8, 0, { keepTogether: true })])] }),
    input({
      flows: [
        flow('c1', 'chapter', [
          block('text', 'p', 1, 1, 12, 0, {
            marks: [
              { name: 'siman', value: 'A', line: 0 },
              { name: 'siman', value: 'B', line: 4 },
              { name: 'kavana', value: 'K', line: 2 },
            ],
          }),
        ]),
      ],
    }),
    input({
      settings: { ...settings, direction: 'rtl' },
      flows: [
        flow('c1', 'chapter', [block('text', 'p', 1, 1, 3, 0)], 'One'),
        { id: 'art', kind: 'fixed', pages: 2 },
        flow('c2', 'chapter', [block('text', 'p', 2, 1, 3, 0)], 'Two'),
      ],
    }),
    input({
      geometry: { textHeight: 200, notesGap: 10 },
      flows: [flow('c1', 'chapter', [block('text', 'p', 1, 0, 3, 0), block('text', 'p', 1, 1, 4, 50, { columns: 2 }), block('text', 'p', 1, 2, 2, 120)])],
    }),
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
    input({
      settings,
      flows: [
        flow('preface', 'front', [block('text', 'p', 0, 1, 2, 0)]),
        { id: 'dedication', kind: 'fixed', pages: 2, sequence: 'front' },
        flow('toc', 'contents', [block('text', 'p', 0, 2, 2, 0)]),
        flow('c1', 'chapter', [block('text', 'p', 1, 1, 3, 0)]),
      ],
    }),
    input({
      geometry: { textHeight: 200, notesGap: 10 },
      flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 4, 0, { columns: 2 }), block('text', 'p', 1, 2, 4, 40, { columns: 2 })])],
    }),
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
    input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 2, 0, { columns: 13 })])] }),
    input({ flows: [{ id: 'art', kind: 'fixed', pages: Number.POSITIVE_INFINITY }] }),
    input({
      flows: [flow('c1', 'chapter', [block('figure', 'img', 1, 2, 1, 0, { columns: 2, lines: [{ top: 0, bottom: 80 }] })])],
    }),
    input({
      settings,
      flows: [
        flow('preface', 'front', [block('text', 'p', 0, 2, 6, 0)], 'Preface'),
        flow('toc', 'contents', [block('text', 'p', 0, 1, 2, 0)], 'Contents'),
        flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0)], 'One'),
      ],
    }),
    input({
      flows: [
        flow('c1', 'chapter', [
          block('text', 'p', 1, 1, 2, 0, { footnoteRefs: [{ note: 'n1', line: 1 }] }),
          block('heading', 'h2', 1, 2, 1, 20),
          block('text', 'p', 1, 3, 4, 30),
        ]),
      ],
      notes: [note('n1', 4)],
    }),
    input({
      flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 2, 0, { footnoteRefs: [{ note: 'n1', line: 1 }] })])],
      notes: [
        {
          id: 'n1',
          lines: [
            { top: 0, bottom: 10 },
            { top: 10, bottom: 20 },
            { top: 20, bottom: 80 },
          ],
        },
      ],
    }),
  ]
}

describe('paginateBook', () => {
  test('fills greedily line by line', () => {
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0)], 'One')] })).pages
    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 50, 0)], [win('c1', 50, 100, 0)], [win('c1', 100, 120, 0)]])
    expect(pages.map((page) => page.number)).toEqual([1, 2, 3])
    expect(pages.map((page) => page.sequence)).toEqual(['body', 'body', 'body'])
    expect(pages[0]?.sectionOpening).toBe(true)
    expect(pages[0]?.runningHead).toBeUndefined()
    expect(pages[1]?.runningHead).toBe('One')
    expect(pages.every((page) => !('folio' in page))).toBe(true)
  })

  test('a footnote moves its reference line to the next page', () => {
    const paragraph = block('text', 'p', 1, 1, 8, 0, { footnoteRefs: [{ note: 'n1', line: 5 }] })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [paragraph])], notes: [note('n1', 3)] })).pages
    expect(pages[0]?.windows).toEqual([win('c1', 0, 50, 0)])
    expect(pages[0]?.notes).toEqual([])
    expect(pages[1]?.windows).toEqual([win('c1', 50, 60, 0)])
    expect(pages[1]?.notes).toEqual([{ id: 'n1', whole: true, start: 0, end: 3 }])
  })

  test('a note continues after keeping two lines with its reference', () => {
    const paragraph = block('text', 'p', 1, 1, 2, 0, { footnoteRefs: [{ note: 'n1', line: 1 }] })
    const pages = paginateBook(
      input({
        geometry: { textHeight: 50, notesGap: 10 },
        flows: [flow('c1', 'chapter', [paragraph])],
        notes: [note('n1', 6)],
      }),
    ).pages
    expect(pages[0]?.windows).toEqual([win('c1', 0, 20, 0)])
    expect(pages[0]?.notes).toEqual([{ id: 'n1', whole: false, start: 0, end: 2 }])
    expect(pages[1]?.notes).toEqual([{ id: 'n1', whole: false, start: 2, end: 6 }])
  })

  test('the reference line moves when two note lines do not fit', () => {
    const paragraph = block('text', 'p', 1, 1, 8, 0, { footnoteRefs: [{ note: 'n1', line: 5 }] })
    const pages = paginateBook(
      input({
        geometry: { textHeight: 100, notesGap: 10 },
        flows: [flow('c1', 'chapter', [paragraph])],
        notes: [note('n1', 2, 25)],
      }),
    ).pages
    expect(pages[0]?.windows).toEqual([win('c1', 0, 50, 0)])
    expect(pages[0]?.notes).toEqual([])
    expect(pages[1]?.windows[0]?.start).toBe(50)
    expect(pages[1]?.notes).toEqual([{ id: 'n1', whole: true, start: 0, end: 2 }])
  })

  test('a continued note that cannot place a line is refused by the referring block', () => {
    const paragraph = block('text', 'p', 1, 1, 2, 0, { footnoteRefs: [{ note: 'n1', line: 1 }] })
    const result = paginateBook(
      input({
        flows: [flow('c1', 'chapter', [paragraph])],
        notes: [
          {
            id: 'n1',
            lines: [
              { top: 0, bottom: 10 },
              { top: 10, bottom: 20 },
              { top: 20, bottom: 80 },
            ],
          },
        ],
      }),
    )
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0]?.notes).toEqual([{ id: 'n1', whole: false, start: 0, end: 2 }])
    expect(result.refusals).toEqual([
      {
        tag: 'p',
        position: { chapter: 1, block: 1 },
        message:
          'The p at chapter 1 block 1 could not establish a fit for a note line in the text area; use a taller text area or a shorter note line to clear this refusal.',
      },
    ])
  })

  test('a heading keeps with the next block', () => {
    const heading = block('heading', 'h2', 1, 1, 1, 0)
    const paragraph = block('text', 'p', 1, 2, 5, 10)
    const previous = block('text', 'p', 1, 0, 4, -40)
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [previous, heading, paragraph])] })).pages
    expect(pages[0]?.windows).toEqual([win('c1', -40, 0, 0)])
    expect(pages[1]?.windows[0]?.start).toBe(0)
    expect(pages[1]?.sectionOpening).toBe(false)
  })

  test('a keep rewind that would empty a page with continued notes leaves only the notes', () => {
    const pages = paginateBook(
      input({
        flows: [
          flow('c1', 'chapter', [
            block('text', 'p', 1, 1, 2, 0, { footnoteRefs: [{ note: 'n1', line: 1 }] }),
            block('heading', 'h2', 1, 2, 1, 20),
            block('text', 'p', 1, 3, 4, 30),
          ]),
        ],
        notes: [note('n1', 4)],
      }),
    ).pages
    expect(pages[0]?.windows).toEqual([win('c1', 0, 20, 0)])
    expect(pages[0]?.notes).toEqual([{ id: 'n1', whole: false, start: 0, end: 2 }])
    expect(pages[1]?.windows).toEqual([])
    expect(pages[1]?.notes).toEqual([{ id: 'n1', whole: false, start: 2, end: 4 }])
    expect(pages[2]?.windows[0]?.start).toBe(20)
  })

  test('a figure or table that fits stays whole', () => {
    const prefix = block('text', 'p', 1, 1, 4, 0)
    const figure = block('figure', 'figure', 1, 2, 4, 40)
    const table = block('table', 'table', 1, 3, 4, 80)
    const pages = paginateBook(input({ geometry: { textHeight: 50, notesGap: 10 }, flows: [flow('c1', 'chapter', [prefix, figure, table])] })).pages
    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 40, 0)], [win('c1', 40, 80, 0)], [win('c1', 80, 120, 0)]])
  })

  test('orphans and widows use the default of two', () => {
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 11, 0)])] })).pages
    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 50, 0)], [win('c1', 50, 90, 0)], [win('c1', 90, 110, 0)]])
  })

  test('orphans and widows honour a custom value', () => {
    const pages = paginateBook(
      input({
        settings: { ...settings, rectoOpenings: false, orphans: 3, widows: 3 },
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 11, 0)])],
      }),
    ).pages
    expect(pages.map((page) => page.windows)).toEqual([[win('c1', 0, 50, 0)], [win('c1', 50, 80, 0)], [win('c1', 80, 110, 0)]])
  })

  test('a table taller than the text area splits and reserves its header', () => {
    const table = block('table', 'table', 1, 1, 11, 0, { headerHeight: 10 })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [table])] })).pages
    expect(pages.map((page) => ({ window: page.windows[0], header: page.headerRepeat }))).toEqual([
      { window: win('c1', 0, 50, 0), header: undefined },
      { window: win('c1', 50, 90, 10), header: 10 },
      { window: win('c1', 90, 110, 10), header: 10 },
    ])
  })

  test('an oversized line is refused by name', () => {
    const figure = block('figure', 'img', 1, 2, 1, 0, { columns: 2, lines: [{ top: 0, bottom: 80 }] })
    const result = paginateBook(input({ flows: [flow('c1', 'chapter', [figure])] }))
    expect(result.pages).toEqual([])
    expect(result.refusals).toEqual([
      {
        tag: 'img',
        position: { chapter: 1, block: 2 },
        message: 'The img at chapter 1 block 2 could not establish a fit in the text area; shorten it or increase the text-area height to clear this refusal.',
      },
    ])
  })

  test('recto openings insert blanks in left-to-right and right-to-left', () => {
    const chapter = (id: string, chapter: number) => flow(id, 'chapter', [block('text', 'p', chapter, 1, 3, 0)], id)
    for (const direction of ['ltr', 'rtl'] as const) {
      const pages = paginateBook(input({ settings: { ...settings, direction }, flows: [chapter('c1', 1), chapter('c2', 2)] })).pages
      expect(pages.map((page) => ({ kind: page.kind, number: page.number, blank: page.blank, opener: page.sectionOpening, sequence: page.sequence }))).toEqual([
        { kind: 'body', number: 1, blank: false, opener: true, sequence: 'body' },
        { kind: 'blank', number: 2, blank: true, opener: false, sequence: 'body' },
        { kind: 'body', number: 3, blank: false, opener: true, sequence: 'body' },
      ])
    }
  })

  test('chapter endnotes paginate like text', () => {
    const body = block('text', 'p', 1, 1, 2, 0)
    const endnotes = block('text', 'p', 1, 2, 3, 20)
    const pages = paginateBook(
      input({
        settings: { ...settings, rectoOpenings: false, endnotePlacement: 'chapter' },
        flows: [flow('c1', 'chapter', [body, endnotes], 'One')],
      }),
    ).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([win('c1', 0, 50, 0)])
    expect(pages[0]?.notes).toEqual([])
  })

  test('front matter is planned after contents and gets a trailing blank', () => {
    const contents = flow('toc', 'contents', [block('text', 'p', 0, 1, 2, 0)], 'Contents')
    const preface = flow('preface', 'front', [block('text', 'p', 0, 2, 6, 0)], 'Preface')
    const chapter = flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0)], 'One')
    const pages = paginateBook(input({ settings, flows: [preface, contents, chapter] })).pages
    expect(
      pages.map((page) => ({ kind: page.kind, number: page.number, sequence: page.sequence, flow: page.windows[0]?.flow ?? page.flow, blank: page.blank })),
    ).toEqual([
      { kind: 'front', number: 1, sequence: 'front', flow: 'preface', blank: false },
      { kind: 'front', number: 2, sequence: 'front', flow: 'preface', blank: false },
      { kind: 'front', number: 3, sequence: 'front', flow: 'toc', blank: false },
      { kind: 'blank', number: 4, sequence: 'front', flow: 'toc', blank: true },
      { kind: 'body', number: 1, sequence: 'body', flow: 'c1', blank: false },
      { kind: 'body', number: 2, sequence: 'body', flow: 'c1', blank: false },
      { kind: 'body', number: 3, sequence: 'body', flow: 'c1', blank: false },
    ])
  })

  test('an odd front-matter count gets a trailing blank so the body opens on a recto', () => {
    const contents = flow('toc', 'contents', [block('text', 'p', 0, 1, 2, 0)])
    const chapter = flow('c1', 'chapter', [block('text', 'p', 1, 1, 3, 0)])
    const pages = paginateBook(input({ settings, flows: [contents, chapter] })).pages
    expect(pages.map((page) => ({ kind: page.kind, number: page.number, sequence: page.sequence }))).toEqual([
      { kind: 'front', number: 1, sequence: 'front' },
      { kind: 'blank', number: 2, sequence: 'front' },
      { kind: 'body', number: 1, sequence: 'body' },
    ])
  })

  test('paginateScript evaluated in a fresh scope matches the imported function on every fixture', () => {
    const run = rebuilt()
    for (const sample of fixtures()) expect(run(sample)).toEqual(paginateBook(sample))
  })
})
