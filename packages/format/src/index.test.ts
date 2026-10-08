import { describe, expect, test } from 'bun:test'
import { annotationCueIssues, Deck, type Narration } from './index.ts'

const shot = {
  key: 'a.b',
  title: 'A',
  file: 'a.b.png',
  size: { width: 1280, height: 720 },
  scale: 2,
  capturedAt: 'now',
  annotations: [{ ring: null, badge: null, arrow: null }],
}
const narration = (cues: Narration['cues']): Narration => ({
  text: 'Hi there',
  words: [
    { text: 'Hi', startMs: 0, endMs: 100 },
    { text: 'there', startMs: 200, endMs: 300 },
  ],
  durationMs: 500,
  audio: null,
  live: false,
  cues,
})

describe('deck', () => {
  test('a cue naming an annotation the shot lacks is refused when the deck is read', () => {
    const result = Deck.safeParse({
      title: 'T',
      slides: [{ id: 's', content: { kind: 'shot', src: 'a.png', shot }, narration: narration([{ word: 0, annotation: 1 }]) }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('names annotation 1, but the slide has 1')
  })

  test('annotation cue issues use the resolved annotation count', () => {
    expect(annotationCueIssues(narration([{ word: 0, annotation: 1 }]), 1)).toEqual(['a cue names annotation 1, but the slide has 1'])
    expect(annotationCueIssues(narration([{ word: 20, annotation: 0 }]), 1)).toEqual([])
  })

  test('a cue past the last word is refused', () => {
    const result = Deck.safeParse({
      title: 'T',
      slides: [{ id: 's', content: { kind: 'shot', src: 'a.png', shot }, narration: narration([{ word: 2, annotation: 0 }]) }],
    })
    expect(result.success).toBe(false)
  })

  test('a deck defaults to a 1280 by 720 canvas with scripts refused', () => {
    const deck = Deck.parse({ title: 'T', slides: [{ id: 's', content: { kind: 'html', html: '<p>x</p>' } }] })
    expect(deck.size).toEqual({ width: 1280, height: 720 })
    expect(deck.scripts).toBe('refuse')
  })
})

import { exceedsLimits, sheetMm, shotsUsed } from './index.ts'

describe('paper and limits', () => {
  test('orientation swaps the sides of a named and a custom paper', () => {
    expect(sheetMm({ paper: 'a4', orientation: 'landscape' })).toEqual({ width: 297, height: 210 })
    expect(sheetMm({ paper: { width: 6, height: 4, unit: 'in' }, orientation: 'portrait' })).toEqual({ width: 101.6, height: 152.4 })
  })

  test('a deck over a host ceiling says which ceiling and by how much', () => {
    const deck = Deck.parse({
      title: 'T',
      slides: [
        { id: 'a', content: { kind: 'html', html: 'xxxx' } },
        { id: 'b', content: { kind: 'html', html: 'x' } },
      ],
    })
    expect(exceedsLimits(deck, { maxSlides: 1, maxSlideBytes: 3 })).toEqual(['the deck has 2 slides; the limit is 1', 'slide 1 is 4 bytes; the limit is 3'])
  })

  test('a deck whose notes exceed the host ceiling is refused', () => {
    const deck = Deck.parse({
      title: 'T',
      slides: [
        { id: 'a', content: { kind: 'html', html: 'x' }, notes: 'four' },
        { id: 'b', content: { kind: 'html', html: 'x' }, notes: 'שלום' },
      ],
    })
    expect(exceedsLimits(deck, { maxNotesBytes: 5 })).toEqual(['slide 2 has 8 bytes of notes; the limit is 5'])
  })

  test('shots used lists embedded and referenced shots alike', () => {
    const deck = Deck.parse({
      title: 'T',
      slides: [
        { id: 'a', content: { kind: 'shot', src: 'a.png', shot } },
        { id: 'b', content: { kind: 'shot-ref', href: '/s/SS-1.json' } },
      ],
    })
    expect(shotsUsed(deck)).toEqual([
      { slide: 'a', key: 'a.b' },
      { slide: 'b', href: '/s/SS-1.json' },
    ])
  })

  test('a slide id used twice is refused', () => {
    expect(
      Deck.safeParse({
        title: 'T',
        slides: [
          { id: 'a', content: { kind: 'html', html: '' } },
          { id: 'a', content: { kind: 'html', html: '' } },
        ],
      }).success,
    ).toBe(false)
  })
})

import { firstStrongDirection, resolveDirection } from './index.ts'

describe('direction', () => {
  test('the first strong letter decides; digits and punctuation do not', () => {
    expect(firstStrongDirection('12, "שלום" world')).toBe('rtl')
    expect(firstStrongDirection('— 3 Create כיתה')).toBe('ltr')
    expect(firstStrongDirection('مرحبا')).toBe('rtl')
    expect(firstStrongDirection('123 …')).toBeNull()
  })

  test('a declared direction wins, then the language, then the text', () => {
    expect(resolveDirection('ltr', 'he', 'שלום')).toBe('ltr')
    expect(resolveDirection('auto', 'he-IL', 'Hello')).toBe('rtl')
    expect(resolveDirection(undefined, undefined, 'שלום')).toBe('rtl')
    expect(resolveDirection(undefined, undefined, '42')).toBe('ltr')
  })
})
