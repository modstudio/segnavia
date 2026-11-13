import { expect, test } from 'bun:test'
import { Book } from './book.ts'
import { identifiedBookInput } from './book-test-helper.ts'

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

test('Book parses its resolved note-series output idempotently', () => {
  expect(Book.parse(parsed)).toEqual(parsed)
})

test('Book refuses an unknown key on an authored note series', () => {
  const authoredUnknown = Book.safeParse(input({ notes: [{ name: 'sources', placement: 'book', numbering: 'book', unknown: true }] }))
  expect(authoredUnknown.success).toBeFalse()
  if (!authoredUnknown.success) {
    expect(authoredUnknown.error.issues[0]?.message).toContain('unknown key "unknown"')
    expect(authoredUnknown.error.issues[0]?.path).toEqual(['notes', 0])
  }
})

test('Book refuses an unknown key on a resolved note series', () => {
  const resolvedUnknown = Book.safeParse({ ...parsed, notes: parsed.notes.map((note, index) => (index === 2 ? { ...note, unknown: true } : note)) })
  expect(resolvedUnknown.success).toBeFalse()
  if (!resolvedUnknown.success) {
    expect(resolvedUnknown.error.issues[0]?.message).toContain('unknown key "unknown"')
    expect(resolvedUnknown.error.issues[0]?.path).toEqual(['notes', 2])
  }
})

test('Book treats a partial resolved presentation as authored input', () => {
  const result = Book.safeParse(input({ notes: [{ name: 'sources', idStem: 'x' }] }))
  expect(result.success).toBeFalse()
  if (!result.success) {
    expect(result.error.issues.some((issue) => issue.message.includes('unknown key "idStem"'))).toBeTrue()
    expect(result.error.issues.every((issue) => !issue.message.includes('blockClass'))).toBeTrue()
  }
})

test('Book keeps the note placement refusal wording', () => {
  const result = Book.safeParse(input({ notes: [{ name: 'sources', placement: 'sideways' }] }))
  expect(result.success).toBeFalse()
  if (!result.success) {
    const placementIssue = result.error.issues.find((issue) => issue.path.at(-1) === 'placement')
    expect(placementIssue).toBeDefined()
    expect(placementIssue?.message.startsWith('notes[')).toBeFalse()
  }
})
