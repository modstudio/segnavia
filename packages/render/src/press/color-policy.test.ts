import { expect, test } from 'bun:test'
import { toPress } from '../color/engine.ts'
import { readProfile } from '../color/profile.ts'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { formatPdfNumber, pressColor } from './color-policy.ts'

const profile = readProfile(buildPressProfile('mft1'))

test.each([0, 0.2, 1])('a neutral %p uses black ink alone', (value) => {
  expect(pressColor(profile, [value, value, value])).toEqual([0, 0, 0, 1 - value])
})

test('a non-neutral uses the color engine', () => {
  expect(pressColor(profile, [0.2, 0.4, 0.6])).toEqual(toPress(profile, [0.2, 0.4, 0.6]))
})

test('PDF number formatting round-trips within half a thousandth without exponent notation', () => {
  for (const value of [0, -0, 1, 0.123456789, 0.000001, 0.9999999]) {
    const formatted = formatPdfNumber(value)
    expect(formatted).not.toMatch(/[eE]/)
    expect(Math.abs(Number(formatted) - value)).toBeLessThanOrEqual(0.0005)
  }
})
