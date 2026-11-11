import { afterEach, describe, expect, test } from 'bun:test'
import { archiveElevenLabsLexicon, LexiconRefusedError, publishElevenLabsLexicon } from './index.ts'

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

  test('updates a dictionary with phrase aliases, request options, and a normalized locator', async () => {
    const controller = new AbortController()
    let request: { url: string; body: unknown; signal: AbortSignal | null | undefined } | undefined
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      request = { url, body: JSON.parse(String(init.body)), signal: init.signal }
      return Response.json({ id: 'dictionary-a', version_id: 'version-b' })
    }) as typeof fetch
    const dictionary = await publishElevenLabsLexicon({
      apiKey: () => 'secret',
      dictionaryId: 'dictionary-a',
      name: 'Shared words',
      caseSensitive: false,
      signal: controller.signal,
      lexicon: { entries: [{ term: 'יום טוב', say: 'יוםטוב', ipa: 'jom tov' }] },
    })
    expect(dictionary).toEqual({ id: 'dictionary-a', versionId: 'version-b' })
    expect(request).toEqual({
      url: 'https://api.elevenlabs.io/v1/pronunciation-dictionaries/dictionary-a/set-rules',
      signal: controller.signal,
      body: { rules: [{ type: 'alias', string_to_replace: 'יום טוב', alias: 'יוםטוב', case_sensitive: false, word_boundaries: true }] },
    })
  })

  test('applies case-insensitive matching to phoneme rules', async () => {
    let body: unknown
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return Response.json({ id: 'dictionary-a', version_id: 'version-a' })
    }) as typeof fetch

    await publishElevenLabsLexicon({
      apiKey: () => 'secret',
      name: 'Shared words',
      phonemes: true,
      caseSensitive: false,
      lexicon: { entries: [{ term: 'route', say: 'root', ipa: 'ɹuːt' }] },
    })

    expect(body).toEqual({
      name: 'Shared words',
      rules: [
        {
          type: 'phoneme',
          string_to_replace: 'route',
          phoneme: 'ɹuːt',
          alphabet: 'ipa',
          case_sensitive: false,
          word_boundaries: true,
        },
      ],
    })
  })

  test('refuses case-insensitive term collisions before publishing', async () => {
    let requests = 0
    globalThis.fetch = (async () => {
      requests++
      return Response.json({ id: 'dictionary-a', version_id: 'version-a' })
    }) as unknown as typeof fetch

    const publishing = publishElevenLabsLexicon({
      apiKey: () => 'secret',
      name: 'Shared words',
      caseSensitive: false,
      lexicon: {
        entries: [
          { term: 'Yom Tov', say: 'YomTov' },
          { term: 'yom tov', say: 'holiday' },
        ],
      },
    })

    await expect(publishing).rejects.toThrow(
      'The terms "Yom Tov" and "yom tov" collide when caseSensitive is false. Set caseSensitive to true or remove one entry.',
    )
    expect(requests).toBe(0)
  })

  test('rejects when the request signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('Publishing cancelled', 'AbortError'))
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw init.signal.reason
      return Response.json({ id: 'dictionary-a', version_id: 'version-a' })
    }) as typeof fetch

    const publishing = publishElevenLabsLexicon({
      apiKey: () => 'secret',
      name: 'Shared words',
      signal: controller.signal,
      lexicon: { entries: [{ term: 'Yom Tov', say: 'YomTov' }] },
    })
    await expect(publishing).rejects.toMatchObject({ name: 'AbortError' })
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
    await expect(error).rejects.toMatchObject({
      name: 'LexiconRefusedError',
      status: 422,
      reason: 'invalid dictionary',
      message: expect.stringContaining('422 invalid dictionary'),
    })
    await expect(error).rejects.toBeInstanceOf(LexiconRefusedError)
    await expect(error).rejects.not.toThrow('private-key')
  })

  test('refuses a successful reply that names no dictionary id', async () => {
    globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch
    await expect(
      publishElevenLabsLexicon({
        apiKey: () => 'secret',
        name: 'Shared words',
        lexicon: { entries: [{ term: 'route', say: 'root' }] },
      }),
    ).rejects.toMatchObject({ status: 200, reason: 'the reply named no dictionary id', message: expect.stringContaining('no dictionary id') })
  })

  test('publishes longer terms first and keeps equal-length terms in entry order', async () => {
    let rules: Array<{ string_to_replace: string }> = []
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      rules = JSON.parse(String(init.body)).rules
      return Response.json({ id: 'dictionary-a', version_id: 'version-a' })
    }) as typeof fetch
    await publishElevenLabsLexicon({
      apiKey: () => 'secret',
      name: 'Shared words',
      lexicon: {
        entries: [
          { term: 'יום', say: 'yom' },
          { term: 'טוב', say: 'tov' },
          { term: 'יום טוב', say: 'yom tov' },
        ],
      },
    })
    expect(rules.map((rule) => rule.string_to_replace)).toEqual(['יום טוב', 'יום', 'טוב'])
  })

  test('archives a dictionary with its escaped id and reads the key at use time', async () => {
    let request: { url: string; method: string | undefined; key: string | null; body: unknown } | undefined
    let key = 'first'
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      request = {
        url,
        method: init.method,
        key: new Headers(init.headers).get('xi-api-key'),
        body: JSON.parse(String(init.body)),
      }
      return new Response(null, { status: 204 })
    }) as typeof fetch
    const apiKey = () => key
    key = 'second'
    await archiveElevenLabsLexicon({ apiKey, dictionaryId: 'shared/dictionary' })
    expect(request).toEqual({
      url: 'https://api.elevenlabs.io/v1/pronunciation-dictionaries/shared%2Fdictionary',
      method: 'PATCH',
      key: 'second',
      body: { archived: true },
    })
  })

  test('archive exposes refusals and an aborted request rejects with the signal reason', async () => {
    globalThis.fetch = (async () => new Response('dictionary is active', { status: 409 })) as unknown as typeof fetch
    await expect(archiveElevenLabsLexicon({ apiKey: () => 'secret', dictionaryId: 'dictionary-a' })).rejects.toMatchObject({
      status: 409,
      reason: 'dictionary is active',
    })

    const controller = new AbortController()
    controller.abort(new DOMException('Archiving cancelled', 'AbortError'))
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw init.signal.reason
      return new Response(null, { status: 204 })
    }) as typeof fetch
    await expect(archiveElevenLabsLexicon({ apiKey: () => 'secret', dictionaryId: 'dictionary-a', signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Archiving cancelled',
    })
  })
})
