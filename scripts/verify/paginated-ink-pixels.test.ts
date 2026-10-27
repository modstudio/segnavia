import { describe, expect, test } from 'bun:test'
import { INK_NEIGHBORHOOD_PX, type InkImage, isInk, presenceDiff, stackImages } from './paginated-ink-pixels.ts'

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

describe('paginated ink pixels', () => {
  test('a channel below 240 is ink and 240 is not', () => {
    expect(isInk(239, 239, 239)).toBe(true)
    expect(isInk(240, 240, 240)).toBe(false)
  })

  test('an all-white composed band loses galley ink', () => {
    const diff = presenceDiff(image(10, 10, [[5, 5]]), image(10, 10, []))
    expect(diff.lost).toBeGreaterThanOrEqual(1)
    expect(diff.over).toBeGreaterThanOrEqual(1)
  })

  test('ink shifted by the neighborhood still matches', () => {
    const galley = image(10, 10, [[5, 5]])
    const composed = image(10, 10, [[5 + INK_NEIGHBORHOOD_PX, 5]])
    expect(presenceDiff(galley, composed).lost).toBe(0)
    expect(presenceDiff(galley, composed).over).toBe(0)
  })

  test('stackImages concatenates bands vertically with the first band on row 0', () => {
    const stacked = stackImages(image(2, 1, [[0, 0]]), image(2, 1, []))
    expect(stacked.height).toBe(2)
    expect(stacked.width).toBe(2)
    expect(isInk(stacked.data[0] ?? 255, stacked.data[1] ?? 255, stacked.data[2] ?? 255)).toBe(true)
    const second = 2 * 4
    expect(isInk(stacked.data[second] ?? 255, stacked.data[second + 1] ?? 255, stacked.data[second + 2] ?? 255)).toBe(false)
  })

  test('union of stacked bands matches galley ink that appears in either window', () => {
    const galley = stackImages(image(4, 1, [[1, 0]]), image(4, 1, [[2, 0]]))
    const composed = stackImages(image(4, 1, [[1, 0]]), image(4, 1, [[2, 0]]))
    expect(presenceDiff(galley, composed).over).toBe(0)
  })

  test('union fails when neither window holds the galley ink', () => {
    const galley = stackImages(image(4, 1, [[1, 0]]), image(4, 1, [[2, 0]]))
    const composed = stackImages(image(4, 1, []), image(4, 1, []))
    expect(presenceDiff(galley, composed).lost).toBeGreaterThanOrEqual(1)
  })
})
