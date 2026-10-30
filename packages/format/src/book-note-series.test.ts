import { describe, expect, test } from 'bun:test'
import { Book, type BookInput } from './index.ts'

const chapter = { title: 'Chapter', html: '<p>Text</p>' }
const page = { paper: 'a5' as const, margin: { top: 12, bottom: 12, inner: 15, outer: 10 } }
const input = (overrides: Partial<BookInput> = {}): BookInput => ({ title: 'Book', mode: 'continuous', chapters: [chapter], ...overrides })

describe('book note series', () => {
  test('resolves declared series and refuses invalid declarations', () => {
    const book = Book.parse(
      input({
        mode: 'paginated',
        page,
        notes: [{ name: 'sources', placement: 'part', numbering: 'book', title: 'Sources' }],
      }),
    )
    expect(book.notes.map(({ name, placement, numbering, marker }) => ({ name, placement, numbering, marker }))).toEqual([
      { name: 'footnote', placement: 'page', numbering: 'chapter', marker: 'symbols' },
      { name: 'endnote', placement: 'book', numbering: 'book', marker: 'arabic' },
      { name: 'sources', placement: 'part', numbering: 'book', marker: 'roman-lower' },
    ])
    expect(Book.safeParse(input({ notes: [{ name: 'bad name', placement: 'book', numbering: 'book' }] })).success).toBe(false)
    expect(
      Book.safeParse(
        input({
          notes: [
            { name: 'sources', placement: 'book', numbering: 'book' },
            { name: 'sources', placement: 'part', numbering: 'part' },
          ],
        }),
      ).error?.issues[0],
    ).toMatchObject({ path: ['notes', 1, 'name'] })
  })

  test('refuses collected series in continuous mode and two page-placed series', () => {
    const collected = Book.safeParse(input({ notes: [{ name: 'sources', placement: 'chapter', numbering: 'chapter' }] }))
    expect(collected.error?.issues.some(({ message }) => message.includes('note series sources uses chapter placement'))).toBe(true)
    const pageSeries = Book.safeParse(
      input({
        mode: 'paginated',
        page,
        notes: [{ name: 'sources', placement: 'page', numbering: 'book' }],
      }),
    )
    expect(pageSeries.error?.issues.some(({ message }) => message.includes('declare one page-placed series'))).toBe(true)
  })
})
