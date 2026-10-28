import { describe, expect, test } from 'bun:test'
import { graphemes, type PdfPageText, pageTextRelation } from './page-text-relation.ts'

function page(words: string[], text = words.join('')): PdfPageText {
  return {
    text,
    graphemes: words.flatMap((word, index) => graphemes(word).map((unit) => ({ text: unit, word: index }))),
  }
}

describe('pageTextRelation', () => {
  test('allows a skipped three-grapheme PDF word', () => {
    expect(pageTextRelation('ab', page(['a', 'xyz', 'b']))).toMatchObject({ matches: true, skipped: ['xyz'] })
  })

  test('rejects a skipped four-grapheme PDF word', () => {
    expect(pageTextRelation('ab', page(['a', 'wxyz', 'b'])).matches).toBe(false)
  })

  test('keeps adjacent short PDF words as separate skipped runs', () => {
    expect(pageTextRelation('ab', page(['a', 'h', 'f', 'f', 'b']))).toMatchObject({ matches: true, skipped: ['h', 'f', 'f'] })
  })

  test('rejects missing screen text when the PDF word is over the bound', () => {
    expect(pageTextRelation('', page(['text'])).matches).toBe(false)
  })

  test('rejects reordered screen text', () => {
    expect(pageTextRelation('ba', page(['a', 'b'])).matches).toBe(false)
  })

  test('rejects a leaked four-grapheme PDF word', () => {
    expect(pageTextRelation('tail', page(['leak', 'tail'])).matches).toBe(false)
  })

  test('rejects a missing screen point and reports the full remaining PDF point excess', () => {
    const relation = pageTextRelation(`א\u05b0`, page(['א'], `א\u05b8\u05bc`))

    expect(relation.matches).toBe(false)
    expect(relation.excessPoints).toBe('\u05b8\u05bc')
  })
})
