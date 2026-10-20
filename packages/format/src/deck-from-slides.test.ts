import { describe, expect, test } from 'bun:test'
import { deckFromSlides, type Narration, type Shot } from './index.ts'

const shot: Shot = {
  key: 'cover',
  title: 'Cover',
  description: null,
  tags: [],
  file: 'cover.png',
  annotatedFile: null,
  size: { width: 1280, height: 720 },
  scale: 1,
  dir: 'ltr',
  annotations: [],
  capturedAt: 'now',
  meta: {},
}

const narration: Narration = {
  text: 'Hello',
  words: [{ text: 'Hello', startMs: 0, endMs: 500 }],
  durationMs: 500,
  audio: null,
  live: false,
  cues: [],
}

describe('deckFromSlides', () => {
  test('maps HTML and shot rows and carries deck options', () => {
    const deck = deckFromSlides(
      [
        { id: 'intro', kind: 'html', html: '<h1>Hello</h1>', notes: 'Private', narration, beforeMs: 100, afterMs: 200, printAtMs: 250 },
        { id: 'cover', kind: 'shot', src: 'cover.png', shot, holdMs: 900 },
      ],
      {
        title: 'Talk',
        size: { width: 1920, height: 1080 },
        layout: 'responsive',
        scripts: 'sandboxed',
        playback: 'continuous',
        captions: 'viewer',
        dir: 'rtl',
        lang: 'he',
      },
    )

    expect(deck.slides[0]).toEqual({
      id: 'intro',
      content: { kind: 'html', html: '<h1>Hello</h1>' },
      notes: 'Private',
      narration,
      beforeMs: 100,
      afterMs: 200,
      printAtMs: 250,
    })
    expect(deck.slides[1]?.content).toEqual({ kind: 'shot', src: 'cover.png', shot })
    expect(deck).toMatchObject({
      title: 'Talk',
      size: { width: 1920, height: 1080 },
      layout: 'responsive',
      scripts: 'sandboxed',
      playback: 'continuous',
      captions: 'viewer',
      dir: 'rtl',
      lang: 'he',
    })
  })

  test('can omit notes for a public projection', () => {
    const deck = deckFromSlides([{ id: 'intro', kind: 'html', html: '', notes: 'Private' }], { title: 'Public', omitNotes: true })
    expect(deck.slides[0]).not.toHaveProperty('notes')
  })

  test('passes narration, shot and timing validation through Deck', () => {
    expect(() => deckFromSlides([{ id: 'intro', kind: 'html', html: '', holdMs: 1, narration }], { title: 'Bad' })).toThrow()
    expect(() => deckFromSlides([{ id: 'intro', kind: 'shot', src: 'cover.png', shot: { ...shot, key: 'not valid' } }], { title: 'Bad' })).toThrow()
    expect(() => deckFromSlides([{ id: 'intro', kind: 'html', html: '', holdMs: 600_001 }], { title: 'Bad' })).toThrow()
  })
})
