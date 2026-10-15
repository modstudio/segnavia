import { describe, expect, test } from 'bun:test'
import type { Lexicon } from '@segnavia/format'
import { lexiconVersion } from '@segnavia/format'
import { lexiconProvider, type VoiceProvider } from './index.ts'

const lexicon: Lexicon = { entries: [{ term: 'route', say: 'root' }] }

describe('lexicon provider', () => {
  test('respells case-sensitive whole words and restores script captions', async () => {
    const received: string[] = []
    const inner: VoiceProvider = {
      id: 'voice',
      async synthesize(text) {
        received.push(text)
        return {
          words: text.split(/\s+/).map((word, index) => ({ text: word, startMs: index * 100, endMs: index * 100 + 80 })),
          durationMs: 300,
          audio: null,
        }
      },
    }
    const speech = await lexiconProvider(inner, lexicon).synthesize('route router Route')
    expect(received).toEqual(['root router Route'])
    expect(speech.words).toEqual([
      { text: 'route', startMs: 0, endMs: 80 },
      { text: 'router', startMs: 100, endMs: 180 },
      { text: 'Route', startMs: 200, endMs: 280 },
    ])
  })

  test('wraps the inner identity and changes with the lexicon', () => {
    const inner: VoiceProvider = { id: 'voice-a', synthesize: async () => ({ words: [], durationMs: 0, audio: null }) }
    expect(lexiconProvider(inner, lexicon).id).toBe(`voice-a-lexicon-${lexiconVersion(lexicon)}`)
    expect(lexiconProvider(inner, { entries: [{ term: 'route', say: 'rowt' }] }).id).not.toBe(lexiconProvider(inner, lexicon).id)
    expect(lexiconProvider({ ...inner, id: 'voice-b' }, lexicon).id).not.toBe(lexiconProvider(inner, lexicon).id)
  })

  test('uses the shared count rule and leaves provider captions when counts differ', async () => {
    const inner: VoiceProvider = {
      id: 'voice',
      async synthesize() {
        return {
          words: [
            { text: 'two', startMs: 0, endMs: 50 },
            { text: 'sounds', startMs: 50, endMs: 100 },
          ],
          durationMs: 100,
          audio: null,
        }
      },
    }
    expect((await lexiconProvider(inner, lexicon).synthesize('route')).words.map((word) => word.text)).toEqual(['two', 'sounds'])
  })
})
