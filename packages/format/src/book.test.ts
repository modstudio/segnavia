import { describe, expect, test } from 'bun:test'
import { Book, type BookInput, jsonSchemas, noteMarkerIssues } from './index.ts'

const chapter = { title: 'Chapter', html: '<p>Text</p>' }
const page = { paper: 'a5' as const, margin: { top: 12, bottom: 12, inner: 15, outer: 10 } }
const input = (overrides: Partial<BookInput> = {}): BookInput => ({ title: 'Book', mode: 'continuous', chapters: [chapter], ...overrides })

describe('book', () => {
  test('language resolves page numbering and note marker defaults', () => {
    for (const lang of ['he', 'he-IL', 'iw']) {
      expect(Book.parse(input({ lang }))).toMatchObject({
        numbering: { frontMatter: 'arabic', body: 'hebrew' },
        footnotes: { marker: 'hebrew', restart: 'chapter' },
        endnotes: { marker: 'arabic', placement: 'book', title: 'הערות' },
      })
    }
    for (const lang of ['en', undefined]) {
      expect(Book.parse(input({ lang }))).toMatchObject({
        numbering: { frontMatter: 'roman-lower', body: 'arabic' },
        footnotes: { marker: 'symbols', restart: 'chapter' },
        endnotes: { marker: 'arabic', placement: 'book', title: 'Notes' },
      })
    }
  })

  test('explicit numbering and note settings override every language default', () => {
    const book = Book.parse(
      input({
        lang: 'he',
        numbering: { frontMatter: 'roman-upper', body: 'roman-lower' },
        footnotes: { marker: 'symbols', restart: 'book' },
        endnotes: { marker: 'hebrew', placement: 'book' },
      }),
    )
    expect(book.numbering).toEqual({ frontMatter: 'roman-upper', body: 'roman-lower' })
    expect(book.footnotes).toEqual({ marker: 'symbols', restart: 'book' })
    expect(book.endnotes).toEqual({ marker: 'hebrew', placement: 'book', title: 'הערות' })
  })

  test('a parsed book resolves every defaulted field', () => {
    expect(Book.parse(input())).toEqual({
      title: 'Book',
      mode: 'continuous',
      scripts: 'refuse',
      frontMatter: [],
      chapters: [chapter],
      numbering: { frontMatter: 'roman-lower', body: 'arabic' },
      footnotes: { marker: 'symbols', restart: 'chapter' },
      endnotes: { marker: 'arabic', placement: 'book', title: 'Notes' },
      rightHandOpenings: false,
      contents: { pageNumbers: true, depth: 2 },
    })
  })

  test('contents depth defaults to two and accepts levels one through six', () => {
    expect(Book.parse(input()).contents.depth).toBe(2)
    expect(Book.parse(input({ contents: { depth: 1 } })).contents.depth).toBe(1)
    expect(Book.parse(input({ contents: { depth: 6 } })).contents.depth).toBe(6)
    expect(Book.safeParse(input({ contents: { depth: 0 } })).success).toBe(false)
    expect(Book.safeParse(input({ contents: { depth: 7 } })).success).toBe(false)
  })

  test('endnotes title follows the language default and accepts an override', () => {
    expect(Book.parse(input()).endnotes.title).toBe('Notes')
    expect(Book.parse(input({ lang: 'iw' })).endnotes.title).toBe('הערות')
    expect(Book.parse(input({ endnotes: { title: 'References' } })).endnotes.title).toBe('References')
  })

  test('front matter accepts a contents entry and refuses a second one by position', () => {
    expect(Book.parse(input({ frontMatter: [{ kind: 'contents', title: 'On this page' }] })).frontMatter).toEqual([{ kind: 'contents', title: 'On this page' }])
    const result = Book.safeParse(input({ frontMatter: [{ kind: 'contents' }, { html: '<p>Foreword</p>' }, { kind: 'contents' }] }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['frontMatter'] })
    expect(result.error?.issues[0]?.message).toContain('positions 1 and 3')
    expect(result.error?.issues[0]?.message).toContain('one must go')
  })

  test('a paginated book needs page', () => {
    const result = Book.safeParse(input({ mode: 'paginated' }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['page'], message: 'a paginated book needs page; set page or use continuous mode' })
  })

  test('front matter and body must have different numbering systems', () => {
    const result = Book.safeParse(input({ frontMatter: [{ html: '<nav>Contents</nav>' }], numbering: { frontMatter: 'arabic', body: 'arabic' } }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['numbering'] })
    expect(result.error?.issues[0]?.message).toContain('both arabic')
    expect(result.error?.issues[0]?.message).toContain('must differ')
  })

  test('chapter endnotes need paginated mode', () => {
    const result = Book.safeParse(input({ endnotes: { placement: 'chapter' } }))
    expect(result.error?.issues[0]).toMatchObject({ path: ['endnotes', 'placement'] })
    expect(result.error?.issues[0]?.message).toContain('only in paginated mode')
    expect(result.error?.issues[0]?.message).toContain('book placement or paginated mode')
  })

  test('page margins must leave a text area in both dimensions', () => {
    const vertical = Book.safeParse(input({ mode: 'paginated', page: { ...page, margin: { ...page.margin, top: 105, bottom: 105 } } }))
    expect(vertical.error?.issues[0]).toMatchObject({ path: ['page', 'margin'] })
    expect(vertical.error?.issues[0]?.message).toContain('210mm')
    expect(vertical.error?.issues[0]?.message).toContain('210mm high')

    const horizontal = Book.safeParse(input({ mode: 'paginated', page: { ...page, margin: { ...page.margin, inner: 74, outer: 74 } } }))
    expect(horizontal.error?.issues[0]?.message).toContain('148mm')
    expect(horizontal.error?.issues[0]?.message).toContain('148mm wide')
  })

  test('note marker issues require both note kinds and matching markers', () => {
    const same = Book.parse(input({ footnotes: { marker: 'arabic' }, endnotes: { marker: 'arabic' } }))
    const different = Book.parse(input())
    expect(noteMarkerIssues(same, { footnotes: false, endnotes: false })).toEqual([])
    expect(noteMarkerIssues(same, { footnotes: true, endnotes: false })).toEqual([])
    expect(noteMarkerIssues(same, { footnotes: false, endnotes: true })).toEqual([])
    expect(noteMarkerIssues(same, { footnotes: true, endnotes: true })).toEqual([
      'footnote and endnote markers are both arabic; the two must differ when both kinds are used',
    ])
    expect(noteMarkerIssues(different, { footnotes: true, endnotes: true })).toEqual([])
  })

  test('the generated book schema describes unresolved input', () => {
    const schema = jsonSchemas().book as { properties?: Record<string, unknown>; required?: string[] }
    expect(schema.properties).toHaveProperty('numbering')
    expect(schema.required).not.toContain('page')
  })
})
