import { describe, expect, test } from 'bun:test'
import { parseBookFixture } from '@segnavia/html'
import { continuousSectionNumberingRefusal } from './book-numbering-policy.ts'

const book = (mode: 'continuous' | 'paginated', numbering?: { counted: false } | { restart: number }) =>
  parseBookFixture({
    title: 'Book',
    mode,
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    chapters: [{ id: 'numbered-section', title: 'Numbered section', html: '<p>Text</p>', ...(numbering ? { numbering } : {}) }],
  })

describe('continuous section numbering policy', () => {
  test('refuses section numbering and names both remedies', () => {
    expect(continuousSectionNumberingRefusal(book('continuous', { restart: 4 }))).toBe(
      'Section "Numbered section" (numbered-section) sets numbering, but continuous book printing cannot apply section numbering; use the paginated layout or remove numbering from section "Numbered section" to clear this refusal.',
    )
  })

  test('allows the paginated layout and an unnumbered continuous book', () => {
    expect(continuousSectionNumberingRefusal(book('paginated', { counted: false }))).toBeUndefined()
    expect(continuousSectionNumberingRefusal(book('continuous'))).toBeUndefined()
  })
})
