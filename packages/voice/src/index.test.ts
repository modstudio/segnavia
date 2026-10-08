import { describe, expect, test } from 'bun:test'
import { pacedProvider, wordsFromCharacters } from './index.ts'

describe('voice', () => {
  test('character alignment folds into words spanning first start to last end', () => {
    const characters = [...'Hi there']
    const starts = characters.map((_, i) => i * 0.1)
    const ends = characters.map((_, i) => i * 0.1 + 0.08)
    expect(wordsFromCharacters(characters, starts, ends)).toEqual([
      { text: 'Hi', startMs: 0, endMs: 180 },
      { text: 'there', startMs: 300, endMs: 780 },
    ])
  })

  test('paced timings never overlap and the duration covers the last word', async () => {
    const speech = await pacedProvider().synthesize('One, two. Three four.')
    for (const [i, word] of speech.words.entries()) {
      expect(word.endMs).toBeGreaterThan(word.startMs)
      if (i > 0) expect(word.startMs).toBeGreaterThan(speech.words[i - 1]?.endMs ?? 0)
    }
    expect(speech.durationMs).toBeGreaterThan(speech.words.at(-1)?.endMs ?? 0)
  })
})

import { alignedProvider } from './index.ts'

describe('aligned provider', () => {
  test('an aligner that loses a word is refused rather than shifting every cue after it', async () => {
    const provider = alignedProvider({
      id: 'test',
      speak: async () => ({ bytes: new Uint8Array([1]), extension: 'wav', durationMs: 1000 }),
      align: async () => [{ text: 'one', startMs: 0, endMs: 100 }],
    })
    await expect(provider.synthesize('one two')).rejects.toThrow('placed 1 words; the narration has 2')
  })
})

describe('paced punctuation', () => {
  test('a sof pasuk or an Arabic question mark ends a sentence as a full stop does', async () => {
    const gap = async (text: string) => {
      const { words } = await pacedProvider().synthesize(text)
      return (words[1]?.startMs ?? 0) - (words[0]?.endMs ?? 0)
    }
    expect(await gap('שלום׃ עולם')).toBe(await gap('hello. world'))
    expect(await gap('مرحبا؟ عالم')).toBe(await gap('hello? world'))
    expect(await gap('שלום, עולם')).toBeLessThan(await gap('שלום׃ עולם'))
  })
})

import { afterEach, beforeEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { elevenLabsProvider, narrate, type VoiceProvider } from './index.ts'

describe('ElevenLabs provider', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test('sends the key at use time and folds the documented alignment into words', async () => {
    let seen: { url: string; key: string | null; body: unknown } | null = null
    let reads = 0
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = { url, key: new Headers(init.headers).get('xi-api-key'), body: JSON.parse(String(init.body)) }
      const characters = [...'Hi there']
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from('mp3').toString('base64'),
          alignment: {
            characters,
            character_start_times_seconds: characters.map((_, i) => i * 0.1),
            character_end_times_seconds: characters.map((_, i) => i * 0.1 + 0.08),
          },
        }),
      )
    }) as typeof fetch
    const provider = elevenLabsProvider({
      voice: 'v1',
      apiKey: () => {
        reads++
        return 'secret'
      },
    })
    expect(reads).toBe(0)
    const speech = await provider.synthesize('Hi there')
    expect(reads).toBe(1)
    expect(seen as unknown).toEqual({
      url: 'https://api.elevenlabs.io/v1/text-to-speech/v1/with-timestamps',
      key: 'secret',
      body: { text: 'Hi there', model_id: 'eleven_multilingual_v2' },
    })
    expect(speech.words.map((w) => w.text)).toEqual(['Hi', 'there'])
    expect(speech.audio?.extension).toBe('mp3')
  })

  test('its identity includes the configured voice', () => {
    const apiKey = () => 'secret'
    expect(elevenLabsProvider({ voice: 'voice-a', model: 'model-a', apiKey }).id).toBe('elevenlabs-model-a-voice-a')
    expect(elevenLabsProvider({ voice: 'voice-b', model: 'model-a', apiKey }).id).toBe('elevenlabs-model-a-voice-b')
  })

  test('a refusal names the status and the reason', async () => {
    globalThis.fetch = (async () => new Response('quota exceeded', { status: 429 })) as unknown as typeof fetch
    await expect(elevenLabsProvider({ voice: 'v', apiKey: () => 'k' }).synthesize('x')).rejects.toThrow('429 quota exceeded')
  })
})

describe('narration cache', () => {
  let directory = ''
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'segnavia-voice-'))
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  test('only changed text is voiced again', async () => {
    const voiced: string[] = []
    const provider: VoiceProvider = {
      id: 'counting',
      synthesize: async (text) => {
        voiced.push(text)
        return { words: [{ text, startMs: 0, endMs: 100 }], durationMs: 200, audio: { bytes: new Uint8Array([1]), extension: 'wav' } }
      },
    }
    await narrate(provider, 'one', { cacheDirectory: directory })
    await narrate(provider, 'two', { cacheDirectory: directory })
    const again = await narrate(provider, 'one', { cacheDirectory: directory })
    await narrate(provider, 'one', { cacheDirectory: directory, voice: 'other' })
    expect(voiced).toEqual(['one', 'two', 'one'])
    expect(again.audio).toMatch(/^[0-9a-f]{16}\.wav$/)
  })
})
