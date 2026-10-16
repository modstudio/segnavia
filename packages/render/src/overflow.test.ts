import { describe, expect, test } from 'bun:test'
import { CHROMIUM_MAX_SHRINK, counterScale } from './overflow.ts'

describe('print overflow counter-scale', () => {
  test('keeps scale one without rightward overflow', () => {
    expect(counterScale(0)).toBe(1)
  })

  test('uses the Chromium cap with rightward overflow', () => {
    expect(counterScale(800)).toBe(CHROMIUM_MAX_SHRINK)
  })
})
