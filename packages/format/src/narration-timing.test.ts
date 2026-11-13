import { describe, expect, test } from 'bun:test'
import { Deck } from './deck.ts'
import { Document } from './document.ts'
import { applyOps } from './document-apply.ts'
import { fingerprintDocument } from './document-fingerprint.ts'
import { DEFAULT_READING_SPEED, narrationTiming } from './narration-timing.ts'

const content = { kind: 'html' as const, html: '' }
const textNarration = { kind: 'text' as const, text: 'Hello there' }

describe('text narration timing', () => {
  test('keeps an existing voiced narration unchanged when kind is absent', () => {
    const voiced = {
      text: 'Hello there',
      words: [
        { text: 'Hello', startMs: 0, endMs: 300 },
        { text: 'there', startMs: 360, endMs: 700 },
      ],
      durationMs: 1100,
      audio: null,
      live: false,
      cues: [],
    }
    const deck = Deck.parse({ title: 'Voiced', slides: [{ id: 'one', content, narration: voiced }] })
    expect(deck.slides[0]?.narration).toEqual(voiced)
  })

  test('parses text alone and defaults to 180 words per minute without storing the default', () => {
    const deck = Deck.parse({
      title: 'Text',
      slides: [{ id: 'one', content, narration: textNarration, beforeMs: 100, afterMs: 200 }],
    })
    expect(deck).not.toHaveProperty('readingSpeed')
    expect(deck.slides[0]?.narration).toEqual({ ...textNarration, cues: [] })
    expect(narrationTiming(deck.slides[0]?.narration as never, deck)).toEqual(narrationTiming(deck.slides[0]?.narration as never, deck))
    expect(DEFAULT_READING_SPEED).toBe(180)
  })

  test('a higher deck reading speed shortens the computed narration', () => {
    const slow = Deck.parse({ title: 'Slow', readingSpeed: 120, slides: [{ id: 'one', content, narration: textNarration }] })
    const fast = Deck.parse({ title: 'Fast', readingSpeed: 240, slides: [{ id: 'one', content, narration: textNarration }] })
    expect(narrationTiming(fast.slides[0]?.narration as never, fast).durationMs).toBeLessThan(
      narrationTiming(slow.slides[0]?.narration as never, slow).durationMs,
    )
  })

  test('refuses an implicit voiced narration with one actionable message', () => {
    const result = Deck.safeParse({ title: 'Missing', slides: [{ id: 'one', content, narration: { text: 'Hello there' } }] })
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]?.message).toContain('words, durationMs, audio')
    expect(result.error?.issues[0]?.message).toContain("kind: 'text'")
  })

  test.each(['audio', 'words', 'durationMs', 'live'] as const)('refuses voiced field %s on text narration', (field) => {
    const result = Deck.safeParse({
      title: 'Wrong field',
      slides: [
        { id: 'one', content, narration: { ...textNarration, [field]: field === 'words' ? [] : field === 'live' ? false : field === 'audio' ? null : 10 } },
      ],
    })
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]?.message).toContain(field)
  })

  test('checks text cues against the computed words', () => {
    const shot = {
      key: 'cue.shot',
      title: 'Cue',
      file: 'cue.png',
      size: { width: 100, height: 100 },
      scale: 1,
      capturedAt: 'now',
      annotations: [{ ring: null, badge: null, arrow: null }],
    }
    const base = { title: 'Cues', slides: [{ id: 'one', content: { kind: 'shot' as const, src: 'cue.png', shot } }] }
    expect(Deck.safeParse({ ...base, slides: [{ ...base.slides[0], narration: { ...textNarration, cues: [{ word: 1, annotation: 0 }] } }] }).success).toBe(true)
    const past = Deck.safeParse({ ...base, slides: [{ ...base.slides[0], narration: { ...textNarration, cues: [{ word: 2, annotation: 0 }] } }] })
    expect(past.error?.issues[0]?.message).toBe('a cue names word 2, but the narration has 2 words')
  })

  test('refuses a computed duration over the slide timing cap', () => {
    const result = Deck.safeParse({
      title: 'Long',
      readingSpeed: 1,
      slides: [{ id: 'one', content, narration: { kind: 'text', text: Array(15).fill('word').join(' ') } }],
    })
    expect(result.error?.issues[0]?.message).toMatch(/computes to \d+ ms, above the 600000 ms cap/)
  })

  test('a document edit remains a parse fixed point with text narration', () => {
    const document = Document.parse({
      type: 'document',
      id: 'deck',
      kind: 'deck',
      title: 'Text',
      children: [{ type: 'slide', id: 'one', content, narration: textNarration }],
    })
    expect(applyOps(document, { base: fingerprintDocument(document), ops: [] })).toEqual(document)
  })
})
