import { describe, expect, test } from 'bun:test'
import { CHROMIUM_MAX_SHRINK, counterScale } from './overflow.ts'

describe('print overflow counter-scale', () => {
  test('keeps scale one without left-to-right overflow', () => {
    expect(counterScale('ltr', 0)).toBe(1)
  })

  test('uses the Chromium cap with left-to-right overflow', () => {
    expect(counterScale('ltr', 800)).toBe(CHROMIUM_MAX_SHRINK)
  })

  test('keeps scale one without right-to-left overflow', () => {
    expect(counterScale('rtl', 0)).toBe(1)
  })

  test('keeps scale one with right-to-left overflow', () => {
    expect(counterScale('rtl', 800)).toBe(1)
  })
})
