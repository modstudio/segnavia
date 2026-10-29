import { describe, expect, test } from 'bun:test'
import { bookPlace, bookPlaceOffset, pageScale, spreadSlots } from './book-presentation.ts'

describe('book place', () => {
  test('uses the first block crossing or following the viewport top', () => {
    expect(
      bookPlace([
        { key: 'first:1', top: -20, bottom: 0 },
        { key: 'first:2', top: -5, bottom: 12 },
        { key: 'first:3', top: 20, bottom: 40 },
      ]),
    ).toBe('first:2')
    expect(bookPlace([{ key: 'first:1', top: -20, bottom: 0 }])).toBeUndefined()
  })

  test('uses the first occurrence of a block split across pages', () => {
    expect(
      bookPlaceOffset(
        [
          { key: 'chapter:2', top: 120 },
          { key: 'chapter:2', top: 640 },
        ],
        'chapter:2',
      ),
    ).toBe(120)
  })

  test('falls back within the same flow, then to the last block of an earlier flow', () => {
    const blocks = [
      { key: 'front:1', top: 10 },
      { key: 'front:3', top: 30 },
      { key: 'chapter:1', top: 50 },
      { key: 'chapter:4', top: 80 },
      { key: 'later:1', top: 100 },
    ]
    expect(bookPlaceOffset(blocks, 'chapter:3')).toBe(50)
    expect(bookPlaceOffset(blocks, 'chapter:1:footnotes')).toBe(50)
    expect(bookPlaceOffset(blocks, 'chapter:0')).toBe(30)
    expect(bookPlaceOffset(blocks, 'front:0')).toBe(0)
  })
})

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
