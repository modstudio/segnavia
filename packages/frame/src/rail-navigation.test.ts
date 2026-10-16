import { describe, expect, test } from 'bun:test'
import { railSelection } from './rail-navigation.ts'

describe('rail selection', () => {
  test('vertical arrows move through slide order', () => {
    expect(railSelection(1, 'ArrowUp', 4, false, 'ltr')).toBe(0)
    expect(railSelection(1, 'ArrowDown', 4, false, 'rtl')).toBe(2)
    expect(railSelection(0, 'ArrowUp', 4, false, 'ltr')).toBe(0)
  })

  test('horizontal arrows follow reading direction', () => {
    expect(railSelection(1, 'ArrowRight', 4, true, 'ltr')).toBe(2)
    expect(railSelection(1, 'ArrowLeft', 4, true, 'ltr')).toBe(0)
    expect(railSelection(1, 'ArrowRight', 4, true, 'rtl')).toBe(0)
    expect(railSelection(1, 'ArrowLeft', 4, true, 'rtl')).toBe(2)
  })

  test('modified and wrong-axis arrows leave selection alone', () => {
    expect(railSelection(1, 'ArrowRight', 4, false, 'ltr')).toBe(1)
    expect(railSelection(1, 'ArrowDown', 4, true, 'ltr')).toBe(1)
  })
})
