import { expect, test } from 'bun:test'
import { BOOK_PROFILE_RESIDUAL_MAX, BOOK_REGISTRATION_SEARCH, BOOK_REGISTRATION_TOLERANCE } from './config.ts'
import { bestProfileShift, measureRegistration, profileMatchPasses, registrationPasses } from './registration.ts'

const PITCH = 96

function pulse(length: number, start: number, width: number): Float64Array {
  const profile = new Float64Array(length)
  for (let i = start; i < start + width && i < length; i++) profile[i] = 1
  return profile
}

const judge = (left: Float64Array, right: Float64Array, search = BOOK_REGISTRATION_SEARCH) => {
  const match = bestProfileShift(left, right, 0, left.length, search)
  return { match, passed: profileMatchPasses(match, BOOK_REGISTRATION_TOLERANCE, BOOK_PROFILE_RESIDUAL_MAX) }
}

function periodic(length: number, first: number, width: number, count: number): Float64Array {
  const profile = new Float64Array(length)
  for (let n = 0; n < count; n++) {
    const start = first + n * PITCH
    for (let i = start; i < start + width && i < length; i++) profile[i] = 1
  }
  return profile
}

test('a 2 px shift fails on dy', () => {
  const left = pulse(400, 100, 40)
  const right = pulse(400, 102, 40)
  const { match, passed } = judge(left, right)
  expect(match.best).toBe(2)
  expect(Math.abs(match.best)).toBeGreaterThan(BOOK_REGISTRATION_TOLERANCE)
  expect(passed).toBeFalse()
})

test('a periodic profile shifted by one pitch fails on residual0, and the same profile unshifted passes with best 0', () => {
  const first = 40
  const width = 20
  const count = 4
  const length = first + count * PITCH + PITCH
  const unshifted = periodic(length, first, width, count)
  const shifted = periodic(length, first + PITCH, width, count)
  const same = judge(unshifted, unshifted)
  expect(same.match.best).toBe(0)
  expect(same.passed).toBeTrue()
  const offset = judge(unshifted, shifted)
  expect(offset.match.residual0).toBeGreaterThan(BOOK_PROFILE_RESIDUAL_MAX)
  expect(offset.passed).toBeFalse()
})

test('RGB body bands pass identically and fail when shifted by one pitch', () => {
  const width = 96
  const height = 96
  const pitch = 24
  const box = { x: 8, y: 8, width: 80, height: 80 }
  const bands = (shift: number): Uint8Array => {
    const pixels = new Uint8Array(width * height * 3).fill(255)
    for (let y = 16 + shift; y < 80; y += pitch) {
      for (let row = y; row < y + 4; row++) pixels.fill(0, (row * width + 12) * 3, (row * width + 84) * 3)
    }
    for (let x = 16 + shift; x < 80; x += pitch) {
      for (let y = 12; y < 84; y++) pixels.fill(0, (y * width + x) * 3, (y * width + x + 4) * 3)
    }
    return pixels
  }
  const screen = bands(0)
  const identical = measureRegistration(screen, screen, width, height, box, BOOK_REGISTRATION_SEARCH)
  const shifted = measureRegistration(screen, bands(pitch), width, height, box, BOOK_REGISTRATION_SEARCH)
  expect(registrationPasses(identical, BOOK_REGISTRATION_TOLERANCE, BOOK_PROFILE_RESIDUAL_MAX)).toBeTrue()
  expect(registrationPasses(shifted, BOOK_REGISTRATION_TOLERANCE, BOOK_PROFILE_RESIDUAL_MAX)).toBeFalse()
})

test('registration refuses an inkless screen body window by name', () => {
  const pixels = new Uint8Array(12 * 12 * 3).fill(255)
  expect(() => measureRegistration(pixels, pixels, 12, 12, { x: 2, y: 3, width: 7, height: 6 }, BOOK_REGISTRATION_SEARCH)).toThrow(
    'The body text window 2,3 7×6 has no ink in the screen raster.',
  )
})
