import { describe, expect, test } from 'bun:test'
import { hashSlideIndex, indexAfterReload, neighborWindow } from './deck-window.ts'

describe('neighbor window', () => {
  test('keeps the selected slide first and at most its two neighbors', () => {
    expect(neighborWindow(0, 40)).toEqual([0, 1])
    expect(neighborWindow(1, 40)).toEqual([1, 0, 2])
    expect(neighborWindow(39, 40)).toEqual([39, 38])
  })
})

describe('reorder mapping', () => {
  test('follows a selected id and clamps when it disappears', () => {
    expect(indexAfterReload(['a', 'b', 'c'], ['c', 'a', 'b'], 'c')).toBe(0)
    expect(indexAfterReload(['a', 'b', 'c'], ['a', 'b'], 'c')).toBe(1)
  })

  test('keeps the old position when a middle selected id disappears', () => {
    expect(indexAfterReload(['a', 'b', 'c', 'd'], ['a', 'c', 'd'], 'b')).toBe(1)
  })
})

describe('slide hashes', () => {
  test('matches exactly and clamps both ends', () => {
    expect(hashSlideIndex('#slide-3', 'slide-', 5)).toBe(2)
    expect(hashSlideIndex('#slide-40', 'slide-', 5)).toBe(4)
    expect(hashSlideIndex('#slide-0', 'slide-', 5)).toBe(0)
    expect(hashSlideIndex('#slide--2', 'slide-', 5)).toBe(0)
    expect(hashSlideIndex('#slide-1foo', 'slide-', 5)).toBeNull()
  })
})
