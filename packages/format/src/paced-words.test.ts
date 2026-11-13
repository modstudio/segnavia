import { describe, expect, test } from 'bun:test'
import { pacedWords } from './paced-words.ts'

describe('paced words', () => {
  test('keeps the established Latin pacing', () => {
    expect(pacedWords('One, two. Three four.', 160)).toEqual({
      words: [
        { text: 'One,', startMs: 0, endMs: 273 },
        { text: 'two.', startMs: 423, endMs: 695 },
        { text: 'Three', startMs: 1045, endMs: 1386 },
        { text: 'four.', startMs: 1446, endMs: 1787 },
      ],
      durationMs: 2537,
    })
  })

  test('combining marks do not lengthen pointed Hebrew', () => {
    const unpointed = pacedWords('שלום־עולם', 180)
    const pointed = pacedWords('שָׁלוֹם־עוֹלָם', 180)
    expect(pointed.durationMs).toBe(unpointed.durationMs)
    expect(pointed.words).toHaveLength(1)
    expect(pointed.durationMs).toBeGreaterThan(0)
  })
})
