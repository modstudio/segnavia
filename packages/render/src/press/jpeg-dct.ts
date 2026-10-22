import { ZIGZAG } from './jpeg-tables.ts'

export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

// 0.5 * Cu * cos((2x+1) u π / 16). A 1-D DCT is a dot product; the 2-D DCT is rows then columns.
const COSINE = new Float64Array(64)
for (let freq = 0; freq < 8; freq++) {
  const scale = 0.5 * (freq === 0 ? 1 / Math.SQRT2 : 1)
  for (let sample = 0; sample < 8; sample++) COSINE[freq * 8 + sample] = scale * Math.cos(((2 * sample + 1) * freq * Math.PI) / 16)
}

function dctDot(input: ArrayLike<number>, inputAt: number, inputStride: number, freq: number): number {
  let sum = 0
  const basis = freq * 8
  for (let sample = 0; sample < 8; sample++) sum += (input[inputAt + sample * inputStride] ?? 0) * (COSINE[basis + sample] ?? 0)
  return sum
}

export function forwardDct(spatial: ArrayLike<number>, output: Float64Array = new Float64Array(64)): Float64Array {
  for (let y = 0; y < 8; y++) {
    for (let u = 0; u < 8; u++) output[y * 8 + u] = dctDot(spatial, y * 8, 1, u)
  }
  const column = new Float64Array(8)
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) column[v] = dctDot(output, u, 8, v)
    for (let v = 0; v < 8; v++) output[v * 8 + u] = column[v] ?? 0
  }
  return output
}

export function quantizeZigzag(dct: ArrayLike<number>, table: ArrayLike<number>): Int32Array {
  const output = new Int32Array(64)
  for (let index = 0; index < 64; index++) {
    const natural = ZIGZAG[index] ?? 0
    output[index] = roundHalfAwayFromZero((dct[natural] ?? 0) / (table[natural] ?? 1))
  }
  return output
}
