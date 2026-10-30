import { describe, expect, test } from 'bun:test'
import { Book, type BookInput } from '@segnavia/format'
import { bookDocument } from './book-document.ts'

const page = { paper: 'a5' as const, margin: { top: 10, bottom: 10, inner: 10, outer: 10 } }
const chapter = (title: string, html: string) => ({ title, html })
const input = (overrides: Partial<BookInput> = {}): BookInput => ({
  title: 'Book',
  mode: 'paginated',
  page,
  body: [chapter('One', '<p>Text</p>')],
  ...overrides,
})

describe('note series document', () => {
  test('places and numbers a series by chapter', () => {
    const result = bookDocument(
      Book.parse(
        input({
          notes: [{ name: 'sources', placement: 'chapter', numbering: 'chapter', marker: 'roman-lower', title: 'Sources' }],
          body: [chapter('One', '<p>A<span data-note="sources">first</span></p>'), chapter('Two', '<p>B<span data-note="sources">second</span></p>')],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual(['segnavia-chapter-1', 'segnavia-notes-sources-1', 'segnavia-chapter-2', 'segnavia-notes-sources-2'])
    expect(result.html).toContain('id="segnavia-note-sources-1-1"')
    expect(result.html).toContain('id="segnavia-note-sources-2-1"')
    expect(result.html).toMatch(/<p class="segnavia-notes-scope" dir="ltr"[^>]*>One<\/p>/)
    expect(result.html).toMatch(
      /<p class="segnavia-notes-scope" dir="ltr">One<\/p><p class="segnavia-note-sources"[^>]*data-segnavia-position="segnavia-notes-sources-1:2"/,
    )
  })

  test('places a part series after the part and restarts its number in the next part', () => {
    const result = bookDocument(
      Book.parse(
        input({
          notes: [{ name: 'sources', placement: 'part', numbering: 'part', marker: 'roman-lower', title: 'Sources' }],
          body: [
            {
              name: 'first',
              title: 'First Part',
              children: [chapter('One', '<p>A<span data-note="sources">first</span></p>'), chapter('Two', '<p>B</p>')],
            },
            {
              name: 'second',
              title: 'Second Part',
              children: [chapter('Three', '<p>C<span data-note="sources">second</span></p>')],
            },
          ],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual([
      'segnavia-chapter-1',
      'segnavia-chapter-2',
      'segnavia-notes-sources-part-1',
      'segnavia-chapter-3',
      'segnavia-notes-sources-part-2',
    ])
    expect(result.html.match(/<bdi>i<\/bdi>/g)).toHaveLength(4)
    expect(result.html).toMatch(/<p class="segnavia-notes-scope" dir="ltr"[^>]*>First Part<\/p>/)
  })

  test('orders book sections by series declaration and numbers each independently', () => {
    const result = bookDocument(
      Book.parse(
        input({
          notes: [{ name: 'sources', placement: 'book', numbering: 'book', marker: 'roman-lower', title: 'Sources' }],
          body: [chapter('One', '<p>A<span data-note="sources">source</span><span data-note="endnote">comment</span></p>')],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual(['segnavia-chapter-1', 'segnavia-endnotes', 'segnavia-notes-sources'])
    expect(result.html).toContain('id="segnavia-note-sources-1"')
    expect(result.html).toContain('id="segnavia-en-1"')
  })

  test('reuses a note number and body for a later call', () => {
    const result = bookDocument(
      Book.parse(
        input({
          body: [chapter('One', '<p>A<span id="source-a" data-note="endnote">body</span> B<a data-note-ref="source-a">again</a></p>')],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.html.match(/id="segnavia-en-1"/g)).toHaveLength(1)
    expect(result.html.match(/href="#segnavia-en-1"/g)).toHaveLength(2)
    expect(result.html).toContain('data-segnavia-note-repeat')
  })

  test('reports unknown series and forward repeated calls', () => {
    const unknown = bookDocument(Book.parse(input({ body: [chapter('One', '<p><span data-note="missing">body</span></p>')] })))
    expect(unknown.issues).toEqual(['data-note names unknown note series missing; declare the series in notes or use a declared series name'])
    const forward = bookDocument(
      Book.parse(input({ body: [chapter('One', '<p><a data-note-ref="later">first</a><span id="later" data-note="endnote">body</span></p>')] })),
    )
    expect(forward.issues).toContain('data-note-ref later names no earlier note; place the note before its repeated call')
  })
})
