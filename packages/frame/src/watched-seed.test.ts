import { expect, test } from 'bun:test'
import { deckLoadOptions } from './deck-load-options.ts'
import { validateWatchedSeed } from './watched-seed.ts'

const entry = { slideId: 'one', reached: true, watchedThrough: false }

test('validates and copies watched facts at the load edge', () => {
  const watched = [{ ...entry, spans: [{ startMs: 10, endMs: 20 }] }]
  const parsed = deckLoadOptions({ base: '/deck/', watched })
  watched[0]?.spans.push({ startMs: 30, endMs: 40 })
  expect(parsed).toEqual({ base: '/deck/', watched: [{ ...entry, spans: [{ startMs: 10, endMs: 20 }] }] })
  expect(deckLoadOptions('/deck/')).toEqual({ base: '/deck/' })
})

test('refuses invalid watched entry fields with their index and fix', () => {
  const cases: Array<[unknown, string]> = [
    [null, 'watched must be an array'],
    [[null], 'watched[0] must be an object'],
    [[{ ...entry, slideId: '' }], 'watched[0].slideId must be a string from 1 to 256 characters'],
    [[{ ...entry, reached: 1 }], 'watched[0].reached must be a boolean'],
    [[{ ...entry, watchedThrough: null }], 'watched[0].watchedThrough must be a boolean'],
    [[{ ...entry, spans: null }], 'watched[0].spans must be an array'],
    [[{ ...entry, spans: [null] }], 'watched[0].spans[0] must be an object'],
    [[{ ...entry, spans: [{ startMs: Number.NaN, endMs: 1 }] }], 'watched[0].spans[0].startMs must be a finite non-negative number'],
    [[{ ...entry, spans: [{ startMs: 2, endMs: 1 }] }], 'watched[0].spans[0].endMs must be at least watched[0].spans[0].startMs'],
  ]
  for (const [value, message] of cases) {
    expect(() => validateWatchedSeed(value)).toThrow(RangeError)
    expect(() => validateWatchedSeed(value)).toThrow(message)
    expect(() => validateWatchedSeed(value)).toThrow('to clear this refusal')
  }
})

test('refuses seed, span and identity bounds', () => {
  expect(() => validateWatchedSeed(Array.from({ length: 10_001 }, () => entry))).toThrow('watched has 10001 entries')
  expect(() => validateWatchedSeed([{ ...entry, spans: Array.from({ length: 1_001 }, () => ({ startMs: 0, endMs: 1 })) }])).toThrow(
    'watched[0].spans has 1001 entries',
  )
  expect(() => validateWatchedSeed([entry, entry])).toThrow('watched[1].slideId repeats watched[0].slideId "one"')
})
