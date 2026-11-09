import { describe, expect, test } from 'bun:test'
import { Document, deckFromDocument, deckFromSlides, type Narration, type Shot } from './index.ts'

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
        settings: { scripts: 'sandboxed', dir: 'rtl', lang: 'he' },
        playback: 'continuous',
        captions: 'viewer',
      },
    )

    expect(deck.children[0]).toEqual({
      type: 'slide',
      id: 'intro',
      content: { kind: 'html', html: '<h1>Hello</h1>' },
      notes: 'Private',
      narration,
      beforeMs: 100,
      afterMs: 200,
      printAtMs: 250,
    })
    expect(deck.children[1]).toMatchObject({ type: 'slide', content: { kind: 'shot', src: 'cover.png', shot } })
    expect(deck).toMatchObject({
      title: 'Talk',
      size: { width: 1920, height: 1080 },
      layout: 'responsive',
      settings: { scripts: 'sandboxed', dir: 'rtl', lang: 'he' },
      playback: 'continuous',
      captions: 'viewer',
    })
  })

  test('can omit notes for a public projection', () => {
    const deck = deckFromSlides([{ id: 'intro', kind: 'html', html: '', notes: 'Private' }], { title: 'Public', omitNotes: true })
    expect(deck.children[0]).not.toHaveProperty('notes')
  })

  test('renders a style like the same directly parsed document', () => {
    const style = {
      tokens: { colors: { accent: '#663399' } },
      css: ':where(h1){color:var(--segnavia-color-accent)}',
    }
    const fromSlides = deckFromSlides([{ id: 'intro', kind: 'html', html: '<h1>Hello</h1>' }], { title: 'Styled', style })
    const direct = Document.parse({
      type: 'document',
      kind: 'deck',
      title: 'Styled',
      style,
      children: [{ type: 'slide', id: 'intro', content: { kind: 'html', html: '<h1>Hello</h1>' } }],
    })

    expect(deckFromDocument(fromSlides)).toEqual(deckFromDocument(direct))
  })

  test('passes narration, shot and timing validation through Deck', () => {
    expect(() => deckFromSlides([{ id: 'intro', kind: 'html', html: '', holdMs: 1, narration }], { title: 'Bad' })).toThrow()
    expect(() => deckFromSlides([{ id: 'intro', kind: 'shot', src: 'cover.png', shot: { ...shot, key: 'not valid' } }], { title: 'Bad' })).toThrow()
    expect(() => deckFromSlides([{ id: 'intro', kind: 'html', html: '', holdMs: 600_001 }], { title: 'Bad' })).toThrow()
  })
})
