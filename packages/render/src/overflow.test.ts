import { describe, expect, test } from 'bun:test'
import { CHROMIUM_MAX_SHRINK, counterScale } from './overflow.ts'

describe('print overflow counter-scale', () => {
  test('keeps scale one without overflow', () => {
    expect(counterScale(0)).toBe(1)
  })

  test('uses the Chromium cap for overflow below the cap ratio', () => {
    expect(counterScale(4)).toBe(CHROMIUM_MAX_SHRINK)
  })

  test('uses the Chromium cap for overflow at the cap ratio', () => {
    expect(counterScale(200)).toBe(CHROMIUM_MAX_SHRINK)
  })

  test('uses the Chromium cap for overflow above the cap ratio', () => {
    expect(counterScale(800)).toBe(CHROMIUM_MAX_SHRINK)
  })
})
