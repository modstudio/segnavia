import { afterEach, describe, expect, test } from 'bun:test'
import { publishElevenLabsLexicon } from './index.ts'

describe('ElevenLabs lexicon publishing', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test('creates a dictionary with alias and selected IPA rules', async () => {
    let request: { url: string; key: string | null; body: unknown } | undefined
    let keyReads = 0
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      request = { url, key: new Headers(init.headers).get('xi-api-key'), body: JSON.parse(String(init.body)) }
      return Response.json({ id: 'dictionary-a', version_id: 'version-a' })
    }) as typeof fetch
    const publishing = publishElevenLabsLexicon({
      apiKey: () => {
        keyReads++
        return 'secret'
      },
      name: 'Shared words',
      description: 'Pronunciations used in narration',
      phonemes: true,
      lexicon: {
        entries: [
          { term: 'route', say: 'root', ipa: 'ɹuːt' },
          { term: 'SQL', say: 'sequel' },
        ],
      },
    })
    expect(keyReads).toBe(1)
    expect(await publishing).toEqual({ id: 'dictionary-a', versionId: 'version-a' })
    expect(request).toEqual({
      url: 'https://api.elevenlabs.io/v1/pronunciation-dictionaries/add-from-rules',
      key: 'secret',
      body: {
        name: 'Shared words',
        description: 'Pronunciations used in narration',
        rules: [
          {
            type: 'phoneme',
            string_to_replace: 'route',
            phoneme: 'ɹuːt',
            alphabet: 'ipa',
            case_sensitive: true,
            word_boundaries: true,
          },
          { type: 'alias', string_to_replace: 'SQL', alias: 'sequel', case_sensitive: true, word_boundaries: true },
        ],
      },
    })
  })

  test('updates a dictionary by replacing every rule and uses aliases when phonemes are disabled', async () => {
    let request: { url: string; body: unknown } | undefined
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      request = { url, body: JSON.parse(String(init.body)) }
      return Response.json({ id: 'dictionary-a', version_id: 'version-b' })
    }) as typeof fetch
    await publishElevenLabsLexicon({
      apiKey: () => 'secret',
      dictionaryId: 'dictionary-a',
      name: 'Shared words',
      lexicon: { entries: [{ term: 'route', say: 'root', ipa: 'ɹuːt' }] },
    })
    expect(request).toEqual({
      url: 'https://api.elevenlabs.io/v1/pronunciation-dictionaries/dictionary-a/set-rules',
      body: { rules: [{ type: 'alias', string_to_replace: 'route', alias: 'root', case_sensitive: true, word_boundaries: true }] },
    })
  })

  test('an empty lexicon creates nothing but can clear an existing dictionary', async () => {
    const requests: unknown[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)) })
      return Response.json({ id: 'dictionary-a', version_id: 'version-c' })
    }) as typeof fetch
    expect(await publishElevenLabsLexicon({ apiKey: () => 'secret', name: 'Empty', lexicon: { entries: [] } })).toBeNull()
    expect(requests).toHaveLength(0)
    await publishElevenLabsLexicon({ apiKey: () => 'secret', name: 'Empty', dictionaryId: 'dictionary-a', lexicon: { entries: [] } })
    expect(requests).toEqual([{ url: 'https://api.elevenlabs.io/v1/pronunciation-dictionaries/dictionary-a/set-rules', body: { rules: [] } }])
  })

  test('a refusal names its status and body without exposing the key', async () => {
    globalThis.fetch = (async () => new Response('invalid dictionary', { status: 422 })) as unknown as typeof fetch
    const error = publishElevenLabsLexicon({
      apiKey: () => 'private-key',
      name: 'Shared words',
      lexicon: { entries: [{ term: 'route', say: 'root' }] },
    })
    await expect(error).rejects.toThrow('422 invalid dictionary')
    await expect(error).rejects.not.toThrow('private-key')
  })
})
