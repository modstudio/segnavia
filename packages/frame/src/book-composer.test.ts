import { describe, expect, test } from 'bun:test'
import { decideBookMeasurement } from './book-composer.ts'

const facts = { frameWidth: 800, sourceBlocks: 1, measuredLines: 1, plannedPages: 1, visibleElapsedMs: 0 }

describe('decideBookMeasurement', () => {
  test('waits without a bound while the frame has no width', () => {
    expect(decideBookMeasurement({ ...facts, frameWidth: 0, visibleElapsedMs: 2_000 }, 1_000)).toBe('wait-for-width')
  })

  test('retries deferred line measurement and page planning within the bound', () => {
    expect(decideBookMeasurement({ ...facts, measuredLines: 0, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
    expect(decideBookMeasurement({ ...facts, plannedPages: 0, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
  })

  test('composes measured or empty source content', () => {
    expect(decideBookMeasurement(facts, 1_000)).toBe('compose')
    expect(decideBookMeasurement({ ...facts, sourceBlocks: 0, measuredLines: 0, plannedPages: 0 }, 1_000)).toBe('compose')
  })

  test('refuses deferred line measurement or page planning at the bound', () => {
    expect(decideBookMeasurement({ ...facts, measuredLines: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
    expect(decideBookMeasurement({ ...facts, plannedPages: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
  })
})
