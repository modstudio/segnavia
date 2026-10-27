import { describe, expect, test } from 'bun:test'
import { Book, type BookInput, BOOK_PARENT_NAMES } from '@segnavia/format'
import { bookView } from './book-view.ts'

const page = { paper: 'a5' as const, margin: { top: 12, bottom: 12, inner: 15, outer: 10 } }
const input = (overrides: Partial<BookInput> = {}): BookInput => ({
  title: 'Book',
  mode: 'continuous',
  chapters: [{ title: 'One', html: '<p>Text</p>' }],
  ...overrides,
})

describe('bookView', () => {
  test('builds a continuous view from the book document', () => {
    const view = bookView(Book.parse(input({ lang: 'en' })))
    expect(view.html).toContain('id="segnavia-chapter-1"')
    expect(view.title).toBe('Book')
    expect(view.lang).toBe('en')
    expect(view.scripts).toBe('refuse')
    expect(view.pagination).toBeUndefined()
  })

  test('adds resolved pagination values for a paginated book', () => {
    const view = bookView(
      Book.parse(
        input({
          mode: 'paginated',
          lang: 'he',
          page,
          rectoOpenings: true,
          runningHead: { recto: { mark: 'siman', which: 'first' } },
        }),
      ),
    )
    expect(view.html).toContain('data-segnavia-flow="segnavia-chapter-1"')
    expect(view.html).toContain('data-segnavia-galleys')
    expect(view.pagination).toMatchObject({
      paper: { width: 148, height: 210 },
      margin: page.margin,
      columnGap: 4,
      direction: 'rtl',
      numbering: { frontMatter: 'arabic', body: 'hebrew' },
      rectoOpenings: true,
      orphans: 2,
      widows: 2,
      endnotePlacement: 'book',
      runningHead: { recto: { mark: 'siman', which: 'first' }, verso: 'title' },
    })
    expect(view.pagination?.parents.map((parent) => parent.name)).toEqual([
      BOOK_PARENT_NAMES.recto,
      BOOK_PARENT_NAMES.verso,
      BOOK_PARENT_NAMES.opener,
      BOOK_PARENT_NAMES.blank,
    ])
  })

  test('refuses a book whose document has issues', () => {
    expect(() =>
      bookView(
        Book.parse(
          input({
            chapters: [{ title: 'One', html: '<p><span data-note="footnote">f</span><span data-note="endnote">e</span></p>' }],
            footnotes: { marker: 'arabic' },
            endnotes: { marker: 'arabic' },
          }),
        ),
      ),
    ).toThrow('footnote and endnote markers are both arabic')
  })
})
