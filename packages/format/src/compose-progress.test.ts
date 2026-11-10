import { describe, expect, test } from 'bun:test'
import { boundComposeProgress, COMPOSE_PROGRESS_PAGES_LIMIT } from './compose-progress.ts'

describe('compose progress bound', () => {
  test('accepts bounded integer progress with an optional total', () => {
    expect(boundComposeProgress({ pages: 0 })).toEqual({ pages: 0 })
    expect(boundComposeProgress({ pages: COMPOSE_PROGRESS_PAGES_LIMIT, total: COMPOSE_PROGRESS_PAGES_LIMIT })).toEqual({
      pages: COMPOSE_PROGRESS_PAGES_LIMIT,
      total: COMPOSE_PROGRESS_PAGES_LIMIT,
    })
  })

  test.each([
    ['negative pages', { pages: -1 }],
    ['fractional pages', { pages: 1.5 }],
    ['over-limit pages', { pages: COMPOSE_PROGRESS_PAGES_LIMIT + 1 }],
    ['non-numeric pages', { pages: '1' }],
    ['negative total', { pages: 0, total: -1 }],
    ['fractional total', { pages: 1, total: 1.5 }],
    ['over-limit total', { pages: 1, total: COMPOSE_PROGRESS_PAGES_LIMIT + 1 }],
    ['pages greater than total', { pages: 2, total: 1 }],
  ])('rejects %s', (_name, value) => {
    expect(boundComposeProgress(value)).toBeUndefined()
  })
})
