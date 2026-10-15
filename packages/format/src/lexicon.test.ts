import { describe, expect, test } from 'bun:test'
import { jsonSchemas, Lexicon, lexiconVersion } from './index.ts'

describe('pronunciation lexicon', () => {
  test('accepts entries with an optional exact IPA spelling', () => {
    expect(
      Lexicon.parse({
        entries: [
          { term: 'route', say: 'root', ipa: 'ɹuːt' },
          { term: 'SQL', say: 'sequel' },
        ],
      }),
    ).toEqual({
      entries: [
        { term: 'route', say: 'root', ipa: 'ɹuːt' },
        { term: 'SQL', say: 'sequel' },
      ],
    })
  })

  test.each([
    [{ entries: [{ term: '', say: 'word' }] }, 'empty term'],
    [{ entries: [{ term: 'two words', say: 'word' }] }, 'term with whitespace'],
    [{ entries: [{ term: 'word', say: '' }] }, 'empty respelling'],
    [{ entries: [{ term: 'word', say: 'two words' }] }, 'respelling with whitespace'],
    [
      {
        entries: [
          { term: 'word', say: 'first' },
          { term: 'word', say: 'second' },
        ],
      },
      'duplicate term',
    ],
  ])('refuses a %s', (value) => {
    expect(Lexicon.safeParse(value).success).toBe(false)
  })

  test('versions ignore entry order and change with every entry field', () => {
    const first = { term: 'route', say: 'root', ipa: 'ɹuːt' }
    const second = { term: 'SQL', say: 'sequel' }
    const version = lexiconVersion({ entries: [first, second] })
    expect(lexiconVersion({ entries: [second, first] })).toBe(version)
    expect(lexiconVersion({ entries: [{ ...first, term: 'Route' }, second] })).not.toBe(version)
    expect(lexiconVersion({ entries: [{ ...first, say: 'rowt' }, second] })).not.toBe(version)
    expect(lexiconVersion({ entries: [{ ...first, ipa: 'ɹaʊt' }, second] })).not.toBe(version)
  })

  test('is available to non-TypeScript hosts as JSON Schema', () => {
    expect(jsonSchemas().lexicon).toMatchObject({ type: 'object', required: ['entries'] })
  })
})
