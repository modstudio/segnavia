import { describe, expect, test } from 'bun:test'
import { isCurrentThumbnailResolution, thumbnailScale } from './thumbnail-canvas.ts'

describe('thumbnail geometry and resolution identity', () => {
  test('scales the deck width to the available inline size', () => {
    expect(thumbnailScale(320, 1280)).toBe(0.25)
  })

  test('only the latest resolution may be mounted', () => {
    expect(isCurrentThumbnailResolution(3, 3)).toBe(true)
    expect(isCurrentThumbnailResolution(2, 3)).toBe(false)
  })
})
