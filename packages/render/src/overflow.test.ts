import { describe, expect, test } from 'bun:test'
import { CHROMIUM_MAX_SHRINK, counterScale } from './overflow.ts'

describe('print overflow counter-scale', () => {
  test('keeps scale one without overflow', () => {
    expect(counterScale(400, 400)).toBe(1)
  })

  test('uses an overflow ratio below the cap', () => {
    expect(counterScale(500, 400)).toBe(1.25)
  })

  test('uses the Chromium cap at the cap', () => {
    expect(counterScale(600, 400)).toBe(CHROMIUM_MAX_SHRINK)
  })

  test('limits a ratio above the Chromium cap', () => {
    expect(counterScale(1200, 400)).toBe(CHROMIUM_MAX_SHRINK)
  })
})
