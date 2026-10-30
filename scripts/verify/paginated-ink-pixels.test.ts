import { describe, expect, test } from 'bun:test'
import { INK_NEIGHBORHOOD_PX, type InkBand, type InkImage, inkBounds, isInk, presenceDiff, stackImages } from './paginated-ink-pixels.ts'

function image(width: number, height: number, pixels: Array<[number, number]>): InkImage {
  const data = new Array(width * height * 4).fill(255)
  for (const [x, y] of pixels) {
    const index = (y * width + x) * 4
    data[index] = 0
    data[index + 1] = 0
    data[index + 2] = 0
    data[index + 3] = 255
  }
  return { width, height, data }
}

function band(width: number, height: number, pixels: Array<[number, number]>, start = 0, end = height): InkBand {
  return { image: image(width, height, pixels), countedRows: { start, end } }
}

describe('paginated ink pixels', () => {
  test('a channel below 240 is ink and 240 is not', () => {
    expect(isInk(239, 239, 239)).toBe(true)
    expect(isInk(240, 240, 240)).toBe(false)
  })

  test('an all-white composed band loses galley ink', () => {
    const diff = presenceDiff(band(10, 10, [[5, 5]]), band(10, 10, []))
    expect(diff.lost).toBeGreaterThanOrEqual(1)
    expect(diff.over).toBeGreaterThanOrEqual(1)
  })

  test('ink shifted by the neighborhood still matches', () => {
    const galley = band(10, 10, [[5, 5]])
    const composed = band(10, 10, [[5 + INK_NEIGHBORHOOD_PX, 5]])
    expect(presenceDiff(galley, composed).lost).toBe(0)
    expect(presenceDiff(galley, composed).over).toBe(0)
  })

  test('stackImages concatenates bands vertically with the first band on row 0', () => {
    const stacked = stackImages(band(2, 1, [[0, 0]]), band(2, 1, []))
    expect(stacked.image.height).toBe(2)
    expect(stacked.image.width).toBe(2)
    expect(isInk(stacked.image.data[0] ?? 255, stacked.image.data[1] ?? 255, stacked.image.data[2] ?? 255)).toBe(true)
    const second = 2 * 4
    expect(isInk(stacked.image.data[second] ?? 255, stacked.image.data[second + 1] ?? 255, stacked.image.data[second + 2] ?? 255)).toBe(false)
  })

  test('union of stacked bands matches galley ink that appears in either window', () => {
    const galley = stackImages(band(4, 1, [[1, 0]]), band(4, 1, [[2, 0]]))
    const composed = stackImages(band(4, 1, [[1, 0]]), band(4, 1, [[2, 0]]))
    expect(presenceDiff(galley, composed).over).toBe(0)
  })

  test('union fails when neither window holds the galley ink', () => {
    const galley = stackImages(band(4, 1, [[1, 0]]), band(4, 1, [[2, 0]]))
    const composed = stackImages(band(4, 1, []), band(4, 1, []))
    expect(presenceDiff(galley, composed).lost).toBeGreaterThanOrEqual(1)
  })

  test('composed ink matches galley ink in context above the counted rows', () => {
    const galley = band(4, 3, [[1, 0]], 1, 3)
    const composed = band(4, 3, [[1, 1]], 1, 3)
    expect(presenceDiff(galley, composed).extra).toBe(0)
  })

  test('galley ink matches composed ink in context above the counted rows', () => {
    const galley = band(4, 3, [[1, 1]], 1, 3)
    const composed = band(4, 3, [[1, 0]], 1, 3)
    expect(presenceDiff(galley, composed).lost).toBe(0)
  })

  test('ink without a match in counted or context rows still differs', () => {
    const galley = band(4, 3, [[1, 0]], 1, 3)
    const composed = band(
      4,
      3,
      [
        [1, 1],
        [3, 1],
      ],
      1,
      3,
    )
    expect(presenceDiff(galley, composed).extra).toBe(1)
  })

  test('stacked break keeps both bands counted with context outside', () => {
    const end = band(4, 3, [[1, 0]], 1, 3)
    const start = band(4, 3, [[2, 2]], 0, 2)
    const stacked = stackImages(end, start)
    const composed = stackImages(band(4, 3, [[1, 1]], 1, 3), band(4, 3, [[2, 1]], 0, 2))
    expect(stacked.countedRows).toEqual({ start: 1, end: 5 })
    expect(stacked.image.height).toBe(6)
    expect(inkBounds(stacked).count).toBe(0)
    expect(presenceDiff(stacked, composed).over).toBe(0)
  })
})
