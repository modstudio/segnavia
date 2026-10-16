import { describe, expect, test } from 'bun:test'
import { annotationCueIssues, DEFAULT_TRANSITION_DURATION_MS, Deck, MAX_TRANSITION_DURATION_MS, type Narration } from './index.ts'

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
  test('defaults image fit at the deck and keeps slide overrides', () => {
    const parsed = Deck.parse({
      title: 'Fits',
      fit: 'cover',
      slides: [
        { id: 'plain', content: { kind: 'image', src: 'plain.png', alt: 'Plain' } },
        { id: 'override', content: { kind: 'image', src: 'override.png', alt: 'Override', fit: 'width' } },
        { id: 'reference', content: { kind: 'shot-ref', href: 'shot.json', fit: 'focus' } },
      ],
    })
    expect(parsed.fit).toBe('cover')
    expect(parsed.slides[0]?.content).toEqual({ kind: 'image', src: 'plain.png', alt: 'Plain' })
    expect(parsed.slides[1]?.content).toEqual({ kind: 'image', src: 'override.png', alt: 'Override', fit: 'width' })
    expect(parsed.slides[2]?.content).toEqual({ kind: 'shot-ref', href: 'shot.json', fit: 'focus' })
    expect(Deck.parse({ title: 'Default', slides: [{ id: 'shot', content: { kind: 'shot-ref', href: 'shot.json' } }] }).fit).toBe('contain')
  })

  test('slide timing is finite, bounded and belongs to the matching slide kind', () => {
    const base = { title: 'T', slides: [{ id: 's', content: { kind: 'html' as const, html: '' } }] }
    for (const field of ['beforeMs', 'afterMs'] as const) {
      const wrong = Deck.safeParse({ ...base, slides: [{ ...base.slides[0], [field]: 1 }] })
      expect(wrong.error?.issues[0]?.path).toEqual(['slides', 0, field])
      expect(Deck.safeParse({ ...base, slides: [{ ...base.slides[0], narration: narration([]), [field]: 600_000 }] }).success).toBe(true)
      expect(Deck.safeParse({ ...base, slides: [{ ...base.slides[0], narration: narration([]), [field]: 600_001 }] }).success).toBe(false)
    }
    const narratedHold = Deck.safeParse({ ...base, slides: [{ ...base.slides[0], narration: narration([]), holdMs: 1 }] })
    expect(narratedHold.error?.issues[0]?.path).toEqual(['slides', 0, 'holdMs'])
    for (const value of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(Deck.safeParse({ ...base, slides: [{ ...base.slides[0], holdMs: value }] }).success).toBe(false)
    }
  })

  test('playback, captions and timing remain absent when omitted', () => {
    const parsed = Deck.parse({ title: 'T', slides: [{ id: 's', content: { kind: 'html', html: '' } }] })
    expect(parsed).not.toHaveProperty('playback')
    expect(parsed).not.toHaveProperty('captions')
    expect(parsed.slides[0]).not.toHaveProperty('holdMs')
  })

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
    expect(deck).toEqual({
      title: 'T',
      size: { width: 1280, height: 720 },
      fit: 'contain',
      scripts: 'refuse',
      slides: [{ id: 's', content: { kind: 'html', html: '<p>x</p>' } }],
    })
  })

  test('a transition defaults its duration and validates the millisecond bounds', () => {
    const input = { title: 'T', slides: [{ id: 's', content: { kind: 'html', html: '' } }] }
    expect(Deck.parse({ ...input, transition: { kind: 'fade' } }).transition).toEqual({ kind: 'fade', duration: DEFAULT_TRANSITION_DURATION_MS })
    expect(Deck.parse({ ...input, transition: { kind: 'slide', duration: 0 } }).transition).toEqual({ kind: 'slide', duration: 0 })
    expect(Deck.parse({ ...input, transition: { kind: 'slide', duration: MAX_TRANSITION_DURATION_MS } }).transition).toEqual({
      kind: 'slide',
      duration: MAX_TRANSITION_DURATION_MS,
    })
    expect(Deck.safeParse({ ...input, transition: { kind: 'fade', duration: -1 } }).success).toBe(false)
    expect(Deck.safeParse({ ...input, transition: { kind: 'fade', duration: MAX_TRANSITION_DURATION_MS + 1 } }).success).toBe(false)
    expect(Deck.safeParse({ ...input, transition: { kind: 'fade', duration: 1.5 } }).success).toBe(false)
  })
})

import { exceedsLimits, shotsUsed } from './index.ts'

describe('limits', () => {
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
