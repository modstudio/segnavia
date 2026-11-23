import { describe, expect, test } from 'bun:test'
import { stepTrackKeyTarget } from './step-track-key.ts'

describe('step track key policy', () => {
  test('moves by slide with arrows and page keys', () => {
    expect(stepTrackKeyTarget('ArrowRight', 2, 6, 'ltr', 5)).toBe(3)
    expect(stepTrackKeyTarget('ArrowUp', 2, 6, 'ltr', 5)).toBe(3)
    expect(stepTrackKeyTarget('PageDown', 2, 6, 'ltr', 5)).toBe(3)
    expect(stepTrackKeyTarget('ArrowLeft', 2, 6, 'ltr', 5)).toBe(1)
    expect(stepTrackKeyTarget('ArrowDown', 2, 6, 'ltr', 5)).toBe(1)
    expect(stepTrackKeyTarget('PageUp', 2, 6, 'ltr', 5)).toBe(1)
  })

  test('reverses inline arrows in right-to-left direction', () => {
    expect(stepTrackKeyTarget('ArrowLeft', 2, 6, 'rtl', 5)).toBe(3)
    expect(stepTrackKeyTarget('ArrowRight', 2, 6, 'rtl', 5)).toBe(1)
  })

  test('moves Home and End to the allowed ends', () => {
    expect(stepTrackKeyTarget('Home', 2, 6, 'ltr', 3)).toBe(0)
    expect(stepTrackKeyTarget('End', 2, 6, 'ltr', 5)).toBe(5)
    expect(stepTrackKeyTarget('End', 2, 6, 'ltr', 3)).toBe(3)
  })

  test('stays within the deck and ignores other keys', () => {
    expect(stepTrackKeyTarget('ArrowLeft', 0, 6, 'ltr', 5)).toBe(0)
    expect(stepTrackKeyTarget('ArrowRight', 5, 6, 'ltr', 5)).toBe(5)
    expect(stepTrackKeyTarget('Enter', 2, 6, 'ltr', 5)).toBeNull()
    expect(stepTrackKeyTarget('Home', 0, 0, 'ltr', 0)).toBeNull()
  })
})
