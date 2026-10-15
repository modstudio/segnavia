import { describe, expect, test } from 'bun:test'
import { Deck, type Narration } from '@segnavia/format'
import { deckTimeline, momentAt, slideDurationMs, slideStateAt, wordAt, wordIndex } from './timeline.ts'

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
  test('slide and deck durations include pauses, holds and marked untimed slides', () => {
    const deck = Deck.parse({
      title: 'T',
      slides: [
        { id: 'a', content: { kind: 'html', html: '' }, narration: { ...narration, cues: [] }, beforeMs: 100, afterMs: 200 },
        { id: 'b', content: { kind: 'html', html: '' }, holdMs: 500 },
        { id: 'c', content: { kind: 'html', html: '' } },
      ],
    })
    expect(deck.slides.map(slideDurationMs)).toEqual([2500, 500, null])
    expect(deckTimeline(deck)).toEqual({
      slides: [
        { startMs: 0, durationMs: 2500, untimed: false },
        { startMs: 2500, durationMs: 500, untimed: false },
        { startMs: 3000, durationMs: null, untimed: true },
      ],
      totalMs: 3000,
    })
  })

  test('slide state has no word before narration and keeps the last word after it', () => {
    const slide = { id: 'a', content: { kind: 'html' as const, html: '' }, narration, beforeMs: 100, afterMs: 200 }
    expect(slideStateAt(slide, 99)).toEqual({ word: null, shown: [], phase: 'before' })
    expect(slideStateAt(slide, 100).phase).toBe('narration')
    expect(slideStateAt(slide, 2300)).toEqual({ word: 4, shown: [1], phase: 'after' })
  })
  test('a pause keeps the word just spoken, so the caption never blanks', () => {
    expect(wordAt(narration, 350)).toBe(0)
    expect(wordAt(narration, 1000)).toBe(2)
  })

  test('nothing is spoken before the first word starts', () => {
    expect(wordAt({ words: [{ text: 'Hi', startMs: 200, endMs: 400 }] }, 100)).toBeNull()
  })

  test('a cue shows from its word until the word that ends it, and not after', () => {
    const slide = { id: 'a', content: { kind: 'html' as const, html: '' }, narration }
    expect(slideStateAt(slide, 399).shown).toEqual([])
    expect(slideStateAt(slide, 400).shown).toEqual([0])
    expect(slideStateAt(slide, 1099).shown).toEqual([0])
    expect(slideStateAt(slide, 1100).shown).toEqual([])
    expect(slideStateAt(slide, 1500).shown).toEqual([1])
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
