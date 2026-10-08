import { describe, expect, test } from 'bun:test'
import type { Narration } from '@segnavia/format'
import { momentAt, wordAt, wordIndex } from './timeline.ts'

const narration: Narration = {
  text: 'Choose New class, then Create.',
  words: [
    { text: 'Choose', startMs: 0, endMs: 300 },
    { text: 'New', startMs: 400, endMs: 600 },
    { text: 'class,', startMs: 650, endMs: 900 },
    { text: 'then', startMs: 1100, endMs: 1300 },
    { text: 'Create.', startMs: 1400, endMs: 1800 },
  ],
  durationMs: 2200,
  audio: null,
  live: false,
  cues: [
    { word: 1, annotation: 0, untilWord: 3 },
    { word: 4, annotation: 1 },
  ],
}

describe('timeline', () => {
  test('a pause keeps the word just spoken, so the caption never blanks', () => {
    expect(wordAt(narration, 350)).toBe(0)
    expect(wordAt(narration, 1000)).toBe(2)
  })

  test('nothing is spoken before the first word starts', () => {
    expect(wordAt({ words: [{ text: 'Hi', startMs: 200, endMs: 400 }] }, 100)).toBeNull()
  })

  test('a cue shows from its word until the word that ends it, and not after', () => {
    expect(momentAt(narration, 399).annotations).toEqual([])
    expect(momentAt(narration, 400).annotations).toEqual([0])
    expect(momentAt(narration, 1099).annotations).toEqual([0])
    expect(momentAt(narration, 1100).annotations).toEqual([])
    expect(momentAt(narration, 1500).annotations).toEqual([1])
  })

  test('the slide ends at its duration, not at its last word', () => {
    expect(momentAt(narration, 1900).ended).toBe(false)
    expect(momentAt(narration, 2200).ended).toBe(true)
  })

  test('a cue names a word by its text, ignoring case and punctuation', () => {
    expect(wordIndex(narration, 'create')).toBe(4)
    expect(wordIndex(narration, 'class')).toBe(2)
    expect(() => wordIndex(narration, 'Delete')).toThrow('no occurrence 1 of "Delete"')
  })
})

describe('cue words in pointed text', () => {
  test('a cue named without niqqud finds the pointed word', () => {
    const pointed = { words: ['לחצו', 'על', 'כִּתָּה', 'חֲדָשָׁה׃'].map((text, i) => ({ text, startMs: i * 100, endMs: i * 100 + 80 })) }
    expect(wordIndex(pointed, 'חדשה')).toBe(3)
  })
})
