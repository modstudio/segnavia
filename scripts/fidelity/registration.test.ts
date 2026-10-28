import { expect, test } from 'bun:test'
import { BOOK_PROFILE_RESIDUAL_MAX, BOOK_REGISTRATION_SEARCH, BOOK_REGISTRATION_TOLERANCE } from './config.ts'
import { bestProfileShift, profileMatchPasses } from './registration.ts'

const PITCH = 96

function pulse(length: number, start: number, width: number): Float64Array {
  const profile = new Float64Array(length)
  for (let i = start; i < start + width && i < length; i++) profile[i] = 1
  return profile
}

const judge = (left: Float64Array, right: Float64Array) => {
  const match = bestProfileShift(left, right, 0, left.length, BOOK_REGISTRATION_SEARCH)
  return { match, passed: profileMatchPasses(match, BOOK_REGISTRATION_TOLERANCE, BOOK_PROFILE_RESIDUAL_MAX) }
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
  const { match, passed } = judge(left, right)
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
