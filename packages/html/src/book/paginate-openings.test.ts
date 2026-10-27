import { describe, expect, test } from 'bun:test'
import { block, flow, input, note, settings } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

const short = (id: string, chapter: number) => flow(id, 'chapter', [block('text', 'p', chapter, 1, 3, 0)], id)

function sides(pages: ReturnType<typeof paginateBook>['pages']) {
  return pages.map((page) => ({
    flow: page.flow,
    role: page.role,
    number: page.number,
    blank: page.blank,
    opener: page.sectionOpening,
  }))
}

describe('paginateBook opening sides', () => {
  test('recto inserts a blank when the next page would be a verso, including after a blank', () => {
    const pages = paginateBook(
      input({
        settings: { ...settings, rectoOpenings: false },
        flows: [short('c1', 1), { ...short('c2', 2), opens: 'recto' }],
      }),
    ).pages
    expect(sides(pages)).toEqual([
      { flow: 'c1', role: 'opener', number: 1, blank: false, opener: true },
      { flow: 'c2', role: 'blank', number: 2, blank: true, opener: false },
      { flow: 'c2', role: 'opener', number: 3, blank: false, opener: true },
    ])
  })

  test('verso inserts a blank when the next page would be a recto', () => {
    const pages = paginateBook(
      input({
        settings: { ...settings, rectoOpenings: false },
        flows: [{ id: 'art', kind: 'fixed', pages: 2, opens: 'verso' }, short('c1', 1)],
      }),
    ).pages
    expect(sides(pages)).toEqual([
      { flow: 'art', role: 'blank', number: 1, blank: true, opener: false },
      { flow: 'art', role: 'fixed', number: 2, blank: false, opener: true },
      { flow: 'art', role: 'fixed', number: 3, blank: false, opener: false },
      { flow: 'c1', role: 'opener', number: 4, blank: false, opener: true },
    ])
  })

  test('any never inserts a blank, even when rectoOpenings is on', () => {
    const pages = paginateBook(
      input({
        settings,
        flows: [short('c1', 1), { ...short('c2', 2), opens: 'any' }],
      }),
    ).pages
    expect(sides(pages)).toEqual([
      { flow: 'c1', role: 'opener', number: 1, blank: false, opener: true },
      { flow: 'c2', role: 'opener', number: 2, blank: false, opener: true },
    ])
  })

  test('continued notes flush before a fixed flow so the next chapter is unchanged', () => {
    const pages = paginateBook(
      input({
        geometry: { textHeight: 50, notesGap: 10 },
        flows: [
          flow('c1', 'chapter', [block('text', 'p', 1, 1, 2, 0, { footnoteRefs: [{ note: 'n1', line: 1 }] })]),
          { id: 'art', kind: 'fixed', pages: 1, opens: 'any' },
          flow('c2', 'chapter', [block('text', 'p', 2, 1, 3, 0)]),
        ],
        notes: [note('n1', 6)],
      }),
    ).pages
    expect(pages.filter((page) => page.flow === 'art').every((page) => page.notes.length === 0)).toBe(true)
    expect(pages.filter((page) => page.flow === 'c2').every((page) => page.notes.length === 0)).toBe(true)
    expect(pages.filter((page) => page.flow === 'c1').some((page) => page.notes.length > 0)).toBe(true)
  })

  test('the default is recto when rectoOpenings is on and any otherwise', () => {
    const two = [short('c1', 1), short('c2', 2)]
    expect(paginateBook(input({ settings, flows: two })).pages.map((page) => page.blank)).toEqual([false, true, false])
    expect(paginateBook(input({ flows: two })).pages.map((page) => page.blank)).toEqual([false, false])
  })
})
