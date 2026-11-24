import { describe, expect, test } from 'bun:test'
import type { Lexicon } from '@segnavia/format'
import { lexiconVersion } from '@segnavia/format'
import { alignedProvider, lexiconProvider, splitWords, type VoiceProvider } from './index.ts'

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

  test.each([
    ['English', 'Yom Tov sameach', { term: 'Yom Tov', say: 'YomTov' }, 'YomTov sameach', 'Yom Tov', 'sameach'],
    ['Hebrew', 'יום טוב שמח', { term: 'יום טוב', say: 'יוםטוב' }, 'יוםטוב שמח', 'יום טוב', 'שמח'],
  ])("restores the author's %s phrase to one spoken word", async (_name, script, entry, spoken, phrase, finalWord) => {
    const received: string[] = []
    const inner: VoiceProvider = {
      id: 'voice',
      async synthesize(text) {
        received.push(text)
        return {
          words: text.split(/\s+/).map((word, index) => ({ text: word, startMs: index * 100, endMs: index * 100 + 80 })),
          durationMs: 200,
          audio: null,
        }
      },
    }

    const speech = await lexiconProvider(inner, { entries: [entry] }).synthesize(script)

    expect(received).toEqual([spoken])
    expect(speech.words).toEqual([
      { text: phrase, startMs: 0, endMs: 80 },
      { text: finalWord, startMs: 100, endMs: 180 },
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

  test('writes a single-word IPA as a phoneme tag and keeps the script caption', async () => {
    const received: string[] = []
    const inner = alignedProvider({
      id: 'voice',
      inlineIpa: 'phoneme-tag',
      async speak(text) {
        received.push(text)
        return { bytes: new Uint8Array([1]), extension: 'wav', durationMs: 500 }
      },
      async align(_audio, text) {
        return splitWords(text).map((word, index) => ({ text: word, startMs: index * 100, endMs: index * 100 + 80 }))
      },
    })
    const provider = lexiconProvider(inner, { entries: [{ term: 'route', say: 'root', ipa: 'ruːt' }] }, { phonemes: true })

    const speech = await provider.synthesize('take this route')

    expect(received).toEqual(['take this <phoneme alphabet="ipa" ph="ruːt">route</phoneme>'])
    expect(speech.words).toEqual([
      { text: 'take', startMs: 0, endMs: 80 },
      { text: 'this', startMs: 100, endMs: 180 },
      { text: 'route', startMs: 200, endMs: 480 },
    ])
    expect(provider.id).toBe(`voice-lexicon-${lexiconVersion({ entries: [{ term: 'route', say: 'root', ipa: 'ruːt' }] })}-ipa`)
  })

  test('writes IPA between slashes and groups a multi-word script caption', async () => {
    const received: string[] = []
    const inner = alignedProvider({
      id: 'voice',
      inlineIpa: 'slashes',
      async speak(text) {
        received.push(text)
        return { bytes: new Uint8Array([1]), extension: 'wav', durationMs: 300 }
      },
      async align(_audio, text) {
        return splitWords(text).map((word, index) => ({ text: word, startMs: index * 100, endMs: index * 100 + 80 }))
      },
    })

    const speech = await lexiconProvider(inner, { entries: [{ term: 'Yom Tov', say: 'YomTov', ipa: 'jɔm tɔv' }] }, { phonemes: true }).synthesize(
      'Yom Tov sameach',
    )

    expect(received).toEqual(['/jɔm tɔv/ sameach'])
    expect(speech.words).toEqual([
      { text: 'Yom Tov', startMs: 0, endMs: 180 },
      { text: 'sameach', startMs: 200, endMs: 280 },
    ])
  })

  test('still respells an entry without IPA in phoneme preview', async () => {
    const received: string[] = []
    const inner: VoiceProvider = {
      id: 'voice',
      inlineIpa: 'slashes',
      async synthesize(text) {
        received.push(text)
        return { words: [{ text, startMs: 0, endMs: 80 }], durationMs: 100, audio: null }
      },
    }

    await lexiconProvider(inner, lexicon, { phonemes: true }).synthesize('route')

    expect(received).toEqual(['root'])
  })

  test('refuses phoneme preview when the provider declares no inline form', () => {
    const inner: VoiceProvider = { id: 'voice', synthesize: async () => ({ words: [], durationMs: 0, audio: null }) }
    expect(() => lexiconProvider(inner, lexicon, { phonemes: true })).toThrow(
      'provider voice declares no inline IPA form; use a provider whose model reads inline IPA (see the voice docs) or preview the respelling without phonemes',
    )
  })

  test('does not advertise the inner provider capability through a lexicon wrapper', () => {
    const inner: VoiceProvider = {
      id: 'voice',
      inlineIpa: 'slashes',
      synthesize: async () => ({ words: [], durationMs: 0, audio: null }),
    }
    const wrapped = lexiconProvider(inner, lexicon)
    expect(wrapped.inlineIpa).toBeUndefined()
    expect(() => lexiconProvider(wrapped, { entries: [{ term: 'Yom Tov', say: 'YomTov', ipa: 'jɔm tɔv' }] }, { phonemes: true })).toThrow(
      `provider ${wrapped.id} declares no inline IPA form; use a provider whose model reads inline IPA (see the voice docs) or preview the respelling without phonemes`,
    )
  })

  test('refuses a multi-word phoneme tag before synthesis', () => {
    const inner: VoiceProvider = {
      id: 'voice',
      inlineIpa: 'phoneme-tag',
      synthesize: async () => ({ words: [], durationMs: 0, audio: null }),
    }
    expect(() => lexiconProvider(inner, { entries: [{ term: 'Yom Tov', say: 'YomTov', ipa: 'jɔm tɔv' }] }, { phonemes: true })).toThrow(
      'cannot write inline IPA for multi-word term "Yom Tov" as a phoneme tag; split the term or use a provider that reads slashes',
    )
  })

  test.each(['bad<ipa', 'bad>ipa', 'bad"ipa', 'bad/ipa', 'bad\nipa', 'bad\u0000ipa'])('refuses unsafe inline IPA %j', (ipa) => {
    const inner: VoiceProvider = {
      id: 'voice',
      inlineIpa: 'slashes',
      synthesize: async () => ({ words: [], durationMs: 0, audio: null }),
    }
    expect(() => lexiconProvider(inner, { entries: [{ term: 'route', say: 'root', ipa }] }, { phonemes: true })).toThrow(
      'cannot write inline IPA for term "route" because its IPA contains a control character or one of <, >, ", /; remove that character',
    )
  })

  test('refuses an ampersand in phoneme-tag IPA', () => {
    const inner: VoiceProvider = {
      id: 'voice',
      inlineIpa: 'phoneme-tag',
      synthesize: async () => ({ words: [], durationMs: 0, audio: null }),
    }
    expect(() => lexiconProvider(inner, { entries: [{ term: 'route', say: 'root', ipa: 'a&b' }] }, { phonemes: true })).toThrow(
      'cannot write inline IPA for term "route" because its IPA contains a control character or one of <, >, &, ", /; remove that character',
    )
  })

  test.each(['bad<term', 'bad>term', 'bad&term', 'bad"term', 'bad\nterm', 'bad\u0000term'])('refuses unsafe phoneme-tag term %j', (term) => {
    const inner: VoiceProvider = {
      id: 'voice',
      inlineIpa: 'phoneme-tag',
      synthesize: async () => ({ words: [], durationMs: 0, audio: null }),
    }
    expect(() => lexiconProvider(inner, { entries: [{ term, say: 'root', ipa: 'ruːt' }] }, { phonemes: true })).toThrow(
      `cannot write inline IPA for term "${term}" as a phoneme tag because the term contains a control character or one of <, >, &, "; remove that character or use a provider that reads slashes`,
    )
  })
})
