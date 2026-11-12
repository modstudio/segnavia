import { expect, test } from 'bun:test'
import { watermarkTextTargetWidth } from './watermark-fit.ts'

test('computes the text target width from its share of the trim width', () => {
  expect(watermarkTextTargetWidth(undefined, 210)).toBe(126)
  expect(watermarkTextTargetWidth(0.25, 200)).toBe(50)
})
