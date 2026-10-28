import { describe, expect, test } from 'bun:test'
import { pageScale, spreadSlots } from './book-presentation.ts'

describe('spreadSlots', () => {
  test('leaves the leading recto slot empty for nonempty books', () => {
    expect(Array.from({ length: 5 }, (_, count) => spreadSlots(count))).toEqual([0, 2, 3, 4, 5])
  })

  test('refuses invalid page counts', () => {
    expect(spreadSlots(-1)).toBe(0)
    expect(spreadSlots(1.5)).toBe(0)
    expect(spreadSlots(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('pageScale', () => {
  test('fits one and two columns without upscaling wide frames', () => {
    expect(pageScale(300, 200, 1)).toBe(1)
    expect(pageScale(300, 200, 2)).toBe(0.75)
    expect(pageScale(800, 200, 2)).toBe(1)
  })

  test('returns zero for zero and non-finite input', () => {
    expect(pageScale(0, 200, 1)).toBe(0)
    expect(pageScale(300, 0, 1)).toBe(0)
    expect(pageScale(300, 200, 0)).toBe(0)
    expect(pageScale(Number.NaN, 200, 1)).toBe(0)
    expect(pageScale(300, Number.POSITIVE_INFINITY, 1)).toBe(0)
  })
})
