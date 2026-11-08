import { describe, expect, test } from 'bun:test'
import { advanceVisibleTime, decideLayoutSettle, LAYOUT_SETTLE_MS } from './layout-settle.ts'

const configured = { textWidth: 700 }

describe('decideLayoutSettle', () => {
  test('waits for usable geometry until the elapsed-time bound', () => {
    const sample = { inlineSize: 0, scrollWidth: 0 }
    expect(decideLayoutSettle(sample, undefined, configured, LAYOUT_SETTLE_MS - 1, LAYOUT_SETTLE_MS)).toBe('wait-for-layout')
    expect(decideLayoutSettle(sample, undefined, configured, LAYOUT_SETTLE_MS, LAYOUT_SETTLE_MS)).toBe('refuse')
  })

  test('waits for off-width non-zero geometry until the elapsed-time bound', () => {
    const sample = { inlineSize: 699, scrollWidth: 1400 }
    expect(decideLayoutSettle(sample, sample, configured, LAYOUT_SETTLE_MS - 1, LAYOUT_SETTLE_MS)).toBe('wait-for-layout')
    expect(decideLayoutSettle(sample, sample, configured, LAYOUT_SETTLE_MS, LAYOUT_SETTLE_MS)).toBe('refuse')
  })

  test('samples matching changed geometry again', () => {
    const previous = { inlineSize: 700, scrollWidth: 1400 }
    const changed = { ...previous, scrollWidth: 2100 }
    expect(decideLayoutSettle(changed, previous, configured, 1, LAYOUT_SETTLE_MS)).toBe('sample-again')
  })

  test('settles matching repeated geometry', () => {
    const sample = { inlineSize: 700, scrollWidth: 1400 }
    expect(decideLayoutSettle(sample, sample, configured, 1, LAYOUT_SETTLE_MS)).toBe('settled')
    expect(decideLayoutSettle(sample, sample, configured, LAYOUT_SETTLE_MS, LAYOUT_SETTLE_MS)).toBe('settled')
  })

  test('refuses geometry that changes on every sample past the bound', () => {
    let elapsedMs = 0
    let previous = { inlineSize: 700, scrollWidth: 700 }
    for (let frame = 1; frame <= 3; frame++) {
      elapsedMs = advanceVisibleTime({ visibleElapsedMs: elapsedMs, frameElapsedMs: 800, hasLayout: true })
      const sample = { inlineSize: 700, scrollWidth: 700 + frame }
      expect(decideLayoutSettle(sample, previous, configured, elapsedMs, LAYOUT_SETTLE_MS)).toBe(frame === 3 ? 'refuse' : 'sample-again')
      previous = sample
    }
  })

  test('settles changed geometry that holds at the configured width before the bound', () => {
    const changed = { inlineSize: 700, scrollWidth: 1401 }
    const elapsedMs = advanceVisibleTime({ visibleElapsedMs: 800, frameElapsedMs: 800, hasLayout: true })
    expect(decideLayoutSettle(changed, changed, configured, elapsedMs, LAYOUT_SETTLE_MS)).toBe('settled')
  })

  test('does not count time without layout toward the settle bound', () => {
    const paused = advanceVisibleTime({ visibleElapsedMs: 1_500, frameElapsedMs: 1_000, hasLayout: false })
    const resumed = advanceVisibleTime({ visibleElapsedMs: paused, frameElapsedMs: 400, hasLayout: true })
    const previous = { inlineSize: 700, scrollWidth: 1400 }
    const changed = { inlineSize: 700, scrollWidth: 1401 }
    expect(paused).toBe(1_500)
    expect(decideLayoutSettle(changed, previous, configured, resumed, LAYOUT_SETTLE_MS)).toBe('sample-again')
  })
})
