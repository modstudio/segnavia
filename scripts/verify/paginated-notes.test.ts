import { describe, expect, test } from 'bun:test'
import { pageContainsNoteText } from './paginated-notes.ts'

describe('pageContainsNoteText', () => {
  test('rejects clipped ascender fragments in place of the note', () => {
    expect(pageContainsNoteText('The chapter closes.1hffhlbk1', 'A short footnote for the large book.')).toBe(false)
  })

  test('accepts the note only when its whole text is on the page', () => {
    expect(pageContainsNoteText('The chapter closes.1*A short footnote for the large book.1', '* A short footnote for the large book.')).toBe(true)
  })
})
