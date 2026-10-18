import { describe, expect, test } from 'bun:test'
import { judgePress } from './config.ts'

describe('press acceptance', () => {
  test('chooses the strict bar for controls and the regression ceiling for effects', () => {
    const difference = { mean: 5, p99: 50 }
    expect(judgePress('control', difference)).toBeFalse()
    expect(judgePress('effects', difference)).toBeTrue()
  })
})
