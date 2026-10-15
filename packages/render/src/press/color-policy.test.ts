import { expect, test } from 'bun:test'
import { toPress } from '../color/engine.ts'
import { readProfile } from '../color/profile.ts'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { assertNeutralTolerance, formatPdfNumber, pressColor } from './color-policy.ts'

const profile = readProfile(buildPressProfile('mft1'))

test.each([0, 0.2, 1])('a neutral %p uses black ink alone', (value) => {
  expect(pressColor(profile, [value, value, value])).toEqual([0, 0, 0, 1 - value])
})

test('a non-neutral uses the color engine', () => {
  expect(pressColor(profile, [0.2, 0.4, 0.6])).toEqual(toPress(profile, [0.2, 0.4, 0.6]))
})

test.each([
  { name: 'at', blue: 103, blackOnly: true },
  { name: 'inside', blue: 102, blackOnly: true },
  { name: 'outside', blue: 104, blackOnly: false },
])('a near-grey $name the tolerance is handled at the boundary', ({ blue, blackOnly }) => {
  const rgb: [number, number, number] = [100 / 255, 101 / 255, blue / 255]
  const converted = pressColor(profile, rgb, 3)
  expect(converted.slice(0, 3).every((channel) => channel === 0)).toBe(blackOnly)
})

test('tolerance zero keeps the exact-neutral rule', () => {
  expect(pressColor(profile, [0.4, 0.4005, 0.4], 0).slice(0, 3)).toEqual([0, 0, 0])
  expect(pressColor(profile, [0.4, 0.402, 0.4], 0)).toEqual(toPress(profile, [0.4, 0.402, 0.4]))
})

test('a snapped near-grey derives black ink from the channel mean', () => {
  const rgb: [number, number, number] = [120 / 255, 121 / 255, 123 / 255]
  const converted = pressColor(profile, rgb, 3)
  expect(converted.slice(0, 3)).toEqual([0, 0, 0])
  expect(converted[3]).toBeCloseTo(1 - (120 + 121 + 123) / 3 / 255)
})

test.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 256])('an invalid neutral tolerance %p is refused with its value and range', (value) => {
  expect(() => assertNeutralTolerance(value)).toThrow(`The press neutral tolerance is ${String(value)}; supported: a finite number from 0 to 255.`)
})

test('PDF number formatting round-trips within half a thousandth without exponent notation', () => {
  for (const value of [0, -0, 1, 0.123456789, 0.000001, 0.9999999]) {
    const formatted = formatPdfNumber(value)
    expect(formatted).not.toMatch(/[eE]/)
    expect(Math.abs(Number(formatted) - value)).toBeLessThanOrEqual(0.0005)
  }
})
