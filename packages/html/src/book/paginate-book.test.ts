import { describe, expect, test } from 'bun:test'
import { paginateBook } from './paginate-book.ts'
import type { PaginateBlock, PaginateBookInput, PaginateFlow, PaginateNote } from './paginate-types.ts'

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

function flow(id: string, kind: PaginateFlow['kind'], blocks: PaginateBlock[], runningHead?: string): PaginateFlow {
  return { id, kind, blocks, ...(runningHead === undefined ? {} : { runningHead }) }
}

function note(id: string, count: number, height = lineHeight): PaginateNote {
  return { id, lines: lines(count, 0, height) }
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

function rebuilt() {
  return new Function(`return (${paginateBook.toString()})`)() as typeof paginateBook
}

describe('paginateBook', () => {
  test('fills greedily line by line', () => {
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0)], 'One')] })).pages
    expect(pages.map((page) => page.windows)).toEqual([
      [{ flow: 'c1', start: 0, end: 50 }],
      [{ flow: 'c1', start: 50, end: 100 }],
      [{ flow: 'c1', start: 100, end: 120 }],
    ])
    expect(pages.map((page) => page.number)).toEqual([1, 2, 3])
    expect(pages[0]?.sectionOpening).toBe(true)
    expect(pages[0]?.runningHead).toBeUndefined()
    expect(pages[1]?.runningHead).toBe('One')
    expect(pages.map((page) => page.folio)).toEqual(['1', '2', '3'])
  })

  test('a footnote moves its reference line to the next page', () => {
    const paragraph = block('text', 'p', 1, 1, 8, 0, { footnoteRefs: [{ note: 'n1', line: 5 }] })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [paragraph])], notes: [note('n1', 3)] })).pages
    expect(pages[0]?.windows).toEqual([{ flow: 'c1', start: 0, end: 50 }])
    expect(pages[0]?.notes).toEqual([])
    expect(pages[1]?.windows).toEqual([{ flow: 'c1', start: 50, end: 60 }])
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
    expect(pages[0]?.windows).toEqual([{ flow: 'c1', start: 0, end: 20 }])
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
    expect(pages[0]?.windows).toEqual([{ flow: 'c1', start: 0, end: 50 }])
    expect(pages[0]?.notes).toEqual([])
    expect(pages[1]?.windows[0]?.start).toBe(50)
    expect(pages[1]?.notes).toEqual([{ id: 'n1', whole: true, start: 0, end: 2 }])
  })

  test('a heading keeps with the next block', () => {
    const heading = block('heading', 'h2', 1, 1, 1, 0)
    const paragraph = block('text', 'p', 1, 2, 5, 10)
    const previous = block('text', 'p', 1, 0, 4, -40)
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [previous, heading, paragraph])] })).pages
    expect(pages[0]?.windows).toEqual([{ flow: 'c1', start: -40, end: 0 }])
    expect(pages[1]?.windows[0]?.start).toBe(0)
    expect(pages[1]?.sectionOpening).toBe(false)
  })

  test('a figure or table that fits stays whole', () => {
    const prefix = block('text', 'p', 1, 1, 4, 0)
    const figure = block('figure', 'figure', 1, 2, 4, 40)
    const table = block('table', 'table', 1, 3, 4, 80)
    const pages = paginateBook(input({ geometry: { textHeight: 50, notesGap: 10 }, flows: [flow('c1', 'chapter', [prefix, figure, table])] })).pages
    expect(pages.map((page) => page.windows)).toEqual([
      [{ flow: 'c1', start: 0, end: 40 }],
      [{ flow: 'c1', start: 40, end: 80 }],
      [{ flow: 'c1', start: 80, end: 120 }],
    ])
  })

  test('orphans and widows use the default of two', () => {
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 11, 0)])] })).pages
    expect(pages.map((page) => page.windows)).toEqual([
      [{ flow: 'c1', start: 0, end: 50 }],
      [{ flow: 'c1', start: 50, end: 90 }],
      [{ flow: 'c1', start: 90, end: 110 }],
    ])
  })

  test('orphans and widows honour a custom value', () => {
    const pages = paginateBook(
      input({
        settings: {
          orphans: 3,
          widows: 3,
          rectoOpenings: false,
          direction: 'ltr',
          sequences: { frontMatter: 'roman-lower', body: 'arabic' },
          endnotePlacement: 'book',
        },
        flows: [flow('c1', 'chapter', [block('text', 'p', 1, 1, 11, 0)])],
      }),
    ).pages
    expect(pages.map((page) => page.windows)).toEqual([
      [{ flow: 'c1', start: 0, end: 50 }],
      [{ flow: 'c1', start: 50, end: 80 }],
      [{ flow: 'c1', start: 80, end: 110 }],
    ])
  })

  test('a table taller than the text area splits and reserves its header', () => {
    const table = block('table', 'table', 1, 1, 11, 0, { headerHeight: 10 })
    const pages = paginateBook(input({ flows: [flow('c1', 'chapter', [table])] })).pages
    expect(pages.map((page) => ({ window: page.windows[0], header: page.headerRepeat }))).toEqual([
      { window: { flow: 'c1', start: 0, end: 50 }, header: undefined },
      { window: { flow: 'c1', start: 50, end: 90 }, header: 10 },
      { window: { flow: 'c1', start: 90, end: 110 }, header: 10 },
    ])
  })

  test('an oversized non-table block is refused by name', () => {
    const figure = block('figure', 'img', 1, 2, 8, 0)
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
      const pages = paginateBook(
        input({
          settings: {
            rectoOpenings: true,
            direction,
            sequences: { frontMatter: 'roman-lower', body: 'arabic' },
            endnotePlacement: 'book',
          },
          flows: [chapter('c1', 1), chapter('c2', 2)],
        }),
      ).pages
      expect(pages.map((page) => ({ kind: page.kind, number: page.number, blank: page.blank, opener: page.sectionOpening, folio: page.folio }))).toEqual([
        { kind: 'body', number: 1, blank: false, opener: true, folio: '1' },
        { kind: 'blank', number: 2, blank: true, opener: false, folio: undefined },
        { kind: 'body', number: 3, blank: false, opener: true, folio: '3' },
      ])
    }
  })

  test('chapter endnotes paginate like text', () => {
    const body = block('text', 'p', 1, 1, 2, 0)
    const endnotes = block('text', 'p', 1, 2, 3, 20)
    const pages = paginateBook(
      input({
        settings: {
          rectoOpenings: false,
          direction: 'ltr',
          sequences: { frontMatter: 'roman-lower', body: 'arabic' },
          endnotePlacement: 'chapter',
        },
        flows: [flow('c1', 'chapter', [body, endnotes], 'One')],
      }),
    ).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.windows).toEqual([{ flow: 'c1', start: 0, end: 50 }])
    expect(pages[0]?.notes).toEqual([])
  })

  test('front matter is planned after contents and gets a trailing blank', () => {
    const contents = flow('toc', 'contents', [block('text', 'p', 0, 1, 2, 0)], 'Contents')
    const preface = flow('preface', 'front', [block('text', 'p', 0, 2, 2, 0)], 'Preface')
    const chapter = flow('c1', 'chapter', [block('text', 'p', 1, 1, 12, 0)], 'One')
    const pages = paginateBook(
      input({
        settings: {
          rectoOpenings: true,
          direction: 'ltr',
          sequences: { frontMatter: 'roman-lower', body: 'arabic' },
          endnotePlacement: 'book',
        },
        flows: [preface, contents, chapter],
      }),
    ).pages
    expect(pages.map((page) => ({ kind: page.kind, number: page.number, folio: page.folio, flow: page.windows[0]?.flow }))).toEqual([
      { kind: 'front', number: 1, folio: 'i', flow: 'preface' },
      { kind: 'front', number: 2, folio: 'ii', flow: 'toc' },
      { kind: 'body', number: 1, folio: '1', flow: 'c1' },
      { kind: 'body', number: 2, folio: '2', flow: 'c1' },
      { kind: 'body', number: 3, folio: '3', flow: 'c1' },
    ])
  })

  test('an odd front-matter count gets a trailing blank so the body opens on a recto', () => {
    const contents = flow('toc', 'contents', [block('text', 'p', 0, 1, 2, 0)])
    const chapter = flow('c1', 'chapter', [block('text', 'p', 1, 1, 3, 0)])
    const pages = paginateBook(
      input({
        settings: {
          rectoOpenings: true,
          direction: 'ltr',
          sequences: { frontMatter: 'roman-lower', body: 'arabic' },
          endnotePlacement: 'book',
        },
        flows: [contents, chapter],
      }),
    ).pages
    expect(pages.map((page) => ({ kind: page.kind, number: page.number, folio: page.folio }))).toEqual([
      { kind: 'front', number: 1, folio: 'i' },
      { kind: 'blank', number: 2, folio: undefined },
      { kind: 'body', number: 1, folio: '1' },
    ])
  })

  test('the function rebuilt from toString returns identical output', () => {
    const sample = input({
      settings: {
        orphans: 2,
        widows: 2,
        rectoOpenings: true,
        direction: 'rtl',
        sequences: { frontMatter: 'roman-lower', body: 'hebrew' },
        endnotePlacement: 'chapter',
      },
      notes: [note('n1', 5)],
      flows: [
        flow('toc', 'contents', [block('text', 'p', 0, 1, 2, 0)]),
        flow('c1', 'chapter', [block('heading', 'h2', 1, 1, 1, 0), block('text', 'p', 1, 2, 6, 10, { footnoteRefs: [{ note: 'n1', line: 2 }] })], 'א'),
        flow('c2', 'chapter', [block('table', 'table', 2, 1, 8, 0, { headerHeight: 10 })], 'ב'),
      ],
    })
    expect(rebuilt()(sample)).toEqual(paginateBook(sample))
  })
})
