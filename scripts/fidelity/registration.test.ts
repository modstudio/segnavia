import { expect, test } from 'bun:test'
import { BOOK_PROFILE_RESIDUAL_MAX, BOOK_REGISTRATION_SEARCH, BOOK_REGISTRATION_TOLERANCE } from './config.ts'
import { bestProfileShift, profileMatchPasses } from './registration.ts'

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

test('identical profiles pass', () => {
  const profile = pulse(400, 100, 40)
  const { match, passed } = judge(profile, profile)
  expect(match.best).toBe(0)
  expect(match.residual0).toBe(0)
  expect(passed).toBeTrue()
})

test('a profile shifted by one pitch fails on both dy and residual', () => {
  const left = pulse(400, 100, 40)
  const right = pulse(400, 100 + PITCH, 40)
  const { match, passed } = judge(left, right, PITCH)
  expect(match.best).toBe(PITCH)
  expect(match.residual0).toBeGreaterThan(BOOK_PROFILE_RESIDUAL_MAX)
  expect(Math.abs(match.best)).toBeGreaterThan(BOOK_REGISTRATION_TOLERANCE)
  expect(passed).toBeFalse()
})

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
