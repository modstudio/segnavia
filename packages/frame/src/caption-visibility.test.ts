import { describe, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { captionHasContent } from './caption-visibility.ts'

const slide = Deck.parse({
  title: 'T',
  slides: [
    {
      id: 'a',
      content: { kind: 'html', html: '' },
      narration: { text: 'Hi', words: [], durationMs: 100, audio: null, live: false, cues: [] },
    },
  ],
}).slides[0]

describe('caption visibility', () => {
  test('a narrated caption has no content when the viewer hides captions', () => {
    expect(captionHasContent({ slide: slide ?? null, captionsVisible: true })).toBe(true)
    expect(captionHasContent({ slide: slide ?? null, captionsVisible: false })).toBe(false)
  })
})
