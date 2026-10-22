import { ZIGZAG } from './jpeg-tables.ts'

const COS = 1 / Math.SQRT2

export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

export function forwardDct(spatial: ArrayLike<number>, output: Float64Array = new Float64Array(64)): Float64Array {
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let sum = 0
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          sum += (spatial[y * 8 + x] ?? 0) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16)
        }
      }
      output[v * 8 + u] = 0.25 * (u === 0 ? COS : 1) * (v === 0 ? COS : 1) * sum
    }
  }
  return output
}

function idctSample(coeff: ArrayLike<number>, x: number, y: number): number {
  let sum = 0
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      const scale = (u === 0 ? COS : 1) * (v === 0 ? COS : 1)
      sum += scale * (coeff[v * 8 + u] ?? 0) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16)
    }
  }
  return 0.25 * sum
}

export function inverseDct(coeff: ArrayLike<number>, output: Float64Array = new Float64Array(64)): Float64Array {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) output[y * 8 + x] = idctSample(coeff, x, y)
  }
  return output
}

export function quantize(dct: ArrayLike<number>, table: ArrayLike<number>): Int32Array {
  const output = new Int32Array(64)
  for (let index = 0; index < 64; index++) output[index] = roundHalfAwayFromZero((dct[index] ?? 0) / (table[index] ?? 1))
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

export function dequantize(quantized: ArrayLike<number>, table: ArrayLike<number>): Float64Array {
  const output = new Float64Array(64)
  for (let index = 0; index < 64; index++) output[index] = (quantized[index] ?? 0) * (table[index] ?? 1)
  return output
}
