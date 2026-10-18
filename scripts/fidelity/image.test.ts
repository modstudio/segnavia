import { describe, expect, test } from 'bun:test'
import { fromPress, proofPixels, readProfile } from '../../packages/render/src/color/index.ts'
import { buildPressProfile } from '../../packages/render/src/color/profile-fixture.test-helper.ts'
import { pressColor } from '../../packages/render/src/press/color-policy.ts'
import { EXPECTED_MARKER_POSITION, MARKER_BORDER, MARKER_BORDER_COLOR, MARKER_FILL, MARKER_SIZE, SCALE } from './config.ts'
import { alignmentFromPixels, differencePixels, proofPressPixels, proofTable } from './image.ts'
import { viewerPageBoxFromPixels } from './readers.ts'

function paintMarker(pixels: Uint8Array, width: number, left: number, top: number, scale = 1): void {
  const size = MARKER_SIZE * SCALE * scale
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const borderWidth = MARKER_BORDER * SCALE * scale
      const border = x < borderWidth || y < borderWidth || x >= size - borderWidth || y >= size - borderWidth
      const color = border ? MARKER_BORDER_COLOR : MARKER_FILL
      const offset = ((top + y) * width + left + x) * 3
      pixels.set(color, offset)
    }
  }
}

describe('fidelity registration', () => {
  test('a displaced marker outside the search window cannot masquerade as a match', () => {
    const width = 180
    const reference = new Uint8Array(width * width * 3).fill(127)
    const displaced = new Uint8Array(reference)
    paintMarker(reference, width, EXPECTED_MARKER_POSITION, EXPECTED_MARKER_POSITION)
    paintMarker(displaced, width, EXPECTED_MARKER_POSITION + 40, EXPECTED_MARKER_POSITION + 40)
    const alignment = alignmentFromPixels(reference, displaced, width, width, EXPECTED_MARKER_POSITION, EXPECTED_MARKER_POSITION)
    expect(alignment.passed).toBeFalse()
    expect(alignment.error).toContain('marker not found')
  })

  test('the Chromium page box comes from the marker on a near-white page', () => {
    const width = 500
    const height = 400
    const pixels = new Uint8Array(width * height * 3).fill(255)
    for (let y = 40; y < 340; y++) {
      for (let x = 50; x < 450; x++) pixels.set([244, 247, 251], (y * width + x) * 3)
    }
    paintMarker(pixels, width, 50 + EXPECTED_MARKER_POSITION, 40 + EXPECTED_MARKER_POSITION)
    expect(viewerPageBoxFromPixels(pixels, width, height, 400, 300)).toEqual({ x: 50, y: 40, width: 400, height: 300 })
  })
})

describe('masked difference', () => {
  test('scores the true difference inside the mask and zero outside it', () => {
    const reference = new Uint8Array(12)
    const actual = Uint8Array.from([0, 0, 0, 10, 20, 30, 0, 0, 0, 0, 0, 0])
    const mask = Uint8Array.from([0, 1, 0, 0])
    expect(differencePixels(reference, actual, 2, 2, mask, true)).toEqual({ mean: 20, p99: 30 })
    expect(differencePixels(reference, actual, 2, 2, mask, false)).toEqual({ mean: 0, p99: 0 })
  })
})

describe('CMYK screen proof', () => {
  const bytes = buildPressProfile('mft1')
  const profile = readProfile(bytes)
  const table = proofTable(bytes)

  test('proofs a near-grey pixel through black ink alone', () => {
    const source = Uint8Array.from([100, 101, 103])
    const expected = fromPress(profile, pressColor(profile, [100 / 255, 101 / 255, 103 / 255])).map((channel) => channel * 255)
    expect(proofPressPixels(profile, table, source)).toEqual(Uint8ClampedArray.from(expected))
  })

  test('proofs a saturated pixel as before', () => {
    const source = Uint8Array.from([40, 120, 220])
    expect(proofPressPixels(profile, table, source)).toEqual(proofPixels(table, source))
  })
})
