import { expect, test } from 'bun:test'
import { chargeOutputImageBytes, MAX_IMAGE_OUTPUT_BYTES } from './image-limits.ts'

test('refuses several image outputs that together cross the render ceiling', () => {
  const state = { outputBytes: 0 }
  for (let image = 0; image < 4; image++) chargeOutputImageBytes(state, MAX_IMAGE_OUTPUT_BYTES)
  expect(() => chargeOutputImageBytes(state, 1)).toThrow(/total image output byte count 800000001.*800000000 output bytes in one render/)
})
