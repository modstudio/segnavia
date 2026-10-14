import { describe, expect, test } from 'bun:test'
import { EXPECTED_MARKER_POSITION, MARKER_BORDER_COLOR, MARKER_FILL, MARKER_SIZE, SCALE } from './config.ts'
import { markerPosition } from './image.ts'
import { viewerPageBoxFromPixels } from './readers.ts'

function paintMarker(pixels: Uint8Array, width: number, left: number, top: number, scale = 1): void {
  const size = MARKER_SIZE * SCALE * scale
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const border = x < 12 * scale || y < 12 * scale || x >= size - 12 * scale || y >= size - 12 * scale
      const color = border ? MARKER_BORDER_COLOR : MARKER_FILL
      const offset = ((top + y) * width + left + x) * 3
      pixels.set(color, offset)
    }
  }
}

describe('fidelity registration', () => {
  test('a displaced marker outside the search window cannot masquerade as a match', () => {
    const width = 180
    const pixels = new Uint8Array(width * width * 3).fill(127)
    paintMarker(pixels, width, EXPECTED_MARKER_POSITION + 40, EXPECTED_MARKER_POSITION + 40)
    const match = markerPosition(pixels, width, width, EXPECTED_MARKER_POSITION, EXPECTED_MARKER_POSITION)
    expect(match.score).toBeGreaterThan(50)
  })

  test('the Chromium page box comes from the marker on a near-white page', () => {
    const width = 520
    const height = 380
    const pixels = new Uint8Array(width * height * 3).fill(255)
    for (let y = 40; y < 340; y++) {
      for (let x = 50; x < 450; x++) pixels.set([244, 247, 251], (y * width + x) * 3)
    }
    paintMarker(pixels, width, 50 + EXPECTED_MARKER_POSITION, 40 + EXPECTED_MARKER_POSITION)
    expect(viewerPageBoxFromPixels(pixels, width, height, 400, 300)).toEqual({ x: 50, y: 40, width: 400, height: 300 })
  })
})
