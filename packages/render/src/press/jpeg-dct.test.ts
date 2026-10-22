import { expect, test } from 'bun:test'
import { forwardDct, quantize } from './jpeg-dct.ts'
import { LUMINANCE_QUANT, scaleLuminanceQuant } from './jpeg-tables.ts'

// ITU-T T.81 / Wikipedia JPEG 8x8 example, already in 0..255, then level-shifted for the DCT.
const WALLACE = [
  52, 55, 61, 66, 70, 61, 64, 73, 63, 59, 55, 90, 109, 85, 69, 72, 62, 59, 68, 113, 144, 104, 66, 73, 63, 58, 71, 122, 154, 106, 70, 69, 67, 61, 68, 104, 126,
  88, 68, 70, 79, 65, 60, 70, 77, 68, 58, 75, 85, 71, 64, 59, 55, 61, 65, 83, 87, 79, 69, 68, 65, 76, 78, 94,
]

const WALLACE_DCT_DC = -415.38
const WALLACE_QUANTIZED = [
  -26, -3, -6, 2, 2, -1, 0, 0, 0, -2, -4, 1, 1, 0, 0, 0, -3, 1, 5, -1, -1, 0, 0, 0, -3, 1, 2, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]

test('IJG quality 50 leaves the luminance table unchanged and quality 85 scales DC to 5', () => {
  expect([...scaleLuminanceQuant(50)]).toEqual([...LUMINANCE_QUANT])
  expect(scaleLuminanceQuant(85)[0]).toBe(5)
})

test('forward DCT of the Wallace 8x8 block matches the published DC and quantized luminance table', () => {
  const spatial = Float64Array.from(WALLACE, (value) => value - 128)
  const dct = forwardDct(spatial)
  expect(dct[0]).toBeCloseTo(WALLACE_DCT_DC, 1)
  const quantized = quantize(dct, LUMINANCE_QUANT)
  for (let index = 0; index < 64; index++) expect(quantized[index], `coeff ${index}`).toBeGreaterThanOrEqual((WALLACE_QUANTIZED[index] ?? 0) - 1)
  for (let index = 0; index < 64; index++) expect(quantized[index], `coeff ${index}`).toBeLessThanOrEqual((WALLACE_QUANTIZED[index] ?? 0) + 1)
})
