import { describe, expect, test } from 'bun:test'
import { jsonSchemas, Lexicon, lexiconVersion } from './index.ts'

describe('pronunciation lexicon', () => {
  test('accepts phrase terms and entries with an optional exact IPA spelling', () => {
    expect(
      Lexicon.parse({
        entries: [
          { term: 'route', say: 'root', ipa: 'ɹuːt' },
          { term: 'SQL', say: 'sequel' },
          { term: 'יום טוב', say: 'יוםטוב' },
        ],
      }),
    ).toEqual({
      entries: [
        { term: 'route', say: 'root', ipa: 'ɹuːt' },
        { term: 'SQL', say: 'sequel' },
        { term: 'יום טוב', say: 'יוםטוב' },
      ],
    })
  })

  test.each([
    ['empty term', { entries: [{ term: '', say: 'word' }] }],
    ['term with repeated spaces', { entries: [{ term: 'two  words', say: 'word' }] }],
    ['term with a leading space', { entries: [{ term: ' two words', say: 'word' }] }],
    ['term with a trailing space', { entries: [{ term: 'two words ', say: 'word' }] }],
    ['term with non-space whitespace', { entries: [{ term: 'two\twords', say: 'word' }] }],
    ['empty respelling', { entries: [{ term: 'word', say: '' }] }],
    ['respelling with whitespace', { entries: [{ term: 'word', say: 'two words' }] }],
    [
      'duplicate term',
      {
        entries: [
          { term: 'word', say: 'first' },
          { term: 'word', say: 'second' },
        ],
      },
    ],
  ])('refuses %s', (_name, value) => {
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
