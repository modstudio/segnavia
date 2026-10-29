import { describe, expect, test } from 'bun:test'
import { decideLayoutSettle, LAYOUT_SETTLE_MS } from './layout-settle.ts'

const configured = { textWidth: 700, paperWidth: 800 }

describe('decideLayoutSettle', () => {
  test('waits for usable geometry until the elapsed-time bound', () => {
    const sample = { inlineSize: 0, paperSize: 0, scrollWidth: 0 }
    expect(decideLayoutSettle(sample, undefined, configured, LAYOUT_SETTLE_MS - 1, LAYOUT_SETTLE_MS)).toBe('wait-for-layout')
    expect(decideLayoutSettle(sample, undefined, configured, LAYOUT_SETTLE_MS, LAYOUT_SETTLE_MS)).toBe('refuse')
  })

  test('waits for off-width non-zero geometry until the elapsed-time bound', () => {
    const sample = { inlineSize: 700, paperSize: 799, scrollWidth: 1400 }
    expect(decideLayoutSettle(sample, sample, configured, LAYOUT_SETTLE_MS - 1, LAYOUT_SETTLE_MS)).toBe('wait-for-layout')
    expect(decideLayoutSettle(sample, sample, configured, LAYOUT_SETTLE_MS, LAYOUT_SETTLE_MS)).toBe('refuse')
  })

  test('samples matching changed geometry again', () => {
    const previous = { inlineSize: 700, paperSize: 800, scrollWidth: 1400 }
    const changed = { ...previous, scrollWidth: 2100 }
    expect(decideLayoutSettle(changed, previous, configured, 1, LAYOUT_SETTLE_MS)).toBe('sample-again')
  })

  test('settles matching repeated geometry', () => {
    const sample = { inlineSize: 700, paperSize: 800, scrollWidth: 1400 }
    expect(decideLayoutSettle(sample, sample, configured, 1, LAYOUT_SETTLE_MS)).toBe('settled')
  })
})
