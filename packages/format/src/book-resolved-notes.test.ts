import { expect, test } from 'bun:test'
import { Book } from './book.ts'
import { identifiedBookInput } from './book-test-helper.ts'

test('Book parses its resolved note-series output idempotently and still refuses unknown note keys', () => {
  const input = (overrides: Record<string, unknown> = {}) =>
    identifiedBookInput({ title: 'Book', mode: 'continuous', chapters: [{ title: 'Chapter', html: '<p>Text</p>' }], ...overrides })
  const parsed = Book.parse(
    input({
      chapters: undefined,
      body: [{ id: 'chapter', title: 'Chapter', html: '<p>Text</p>', contents: true }],
      notes: [
        { name: 'footnote', placement: 'page', numbering: 'chapter', marker: 'symbols', title: 'Footnotes' },
        { name: 'endnote', placement: 'book', numbering: 'book', marker: 'arabic', title: 'Notes' },
        { name: 'sources', placement: 'book', numbering: 'book', marker: 'roman-lower', title: 'Sources' },
      ],
    }),
  )
  expect(Book.parse(parsed)).toEqual(parsed)
  const authoredUnknown = Book.safeParse(input({ notes: [{ name: 'sources', placement: 'book', numbering: 'book', unknown: true }] }))
  expect(authoredUnknown.success).toBeFalse()
  if (!authoredUnknown.success) expect(authoredUnknown.error.issues[0]?.message).toContain('notes[0].unknown: unknown key "unknown"')
  const resolvedUnknown = Book.safeParse({ ...parsed, notes: parsed.notes.map((note, index) => (index === 2 ? { ...note, unknown: true } : note)) })
  expect(resolvedUnknown.success).toBeFalse()
  if (!resolvedUnknown.success) expect(resolvedUnknown.error.issues[0]?.message).toContain('notes[2].unknown: unknown key "unknown"')
})
