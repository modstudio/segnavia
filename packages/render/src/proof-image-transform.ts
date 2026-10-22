import { proofPixels } from './color/proof.ts'
import type { ProofTable } from './color/types.ts'

/** Proofs the RGB channels of a raster while preserving its alpha channel. */
export function proofRgba(table: ProofTable, source: Uint8Array): Uint8ClampedArray {
  if (source.length % 4 !== 0) throw new RangeError(`Proof raster byte length ${source.length} is not packed RGBA.`)
  const rgb = new Uint8Array((source.length / 4) * 3)
  for (let sourceOffset = 0, rgbOffset = 0; sourceOffset < source.length; sourceOffset += 4, rgbOffset += 3) {
    rgb[rgbOffset] = source[sourceOffset] ?? 0
    rgb[rgbOffset + 1] = source[sourceOffset + 1] ?? 0
    rgb[rgbOffset + 2] = source[sourceOffset + 2] ?? 0
  }
  const proofed = proofPixels(table, rgb)
  const result = new Uint8ClampedArray(source.length)
  for (let targetOffset = 0, rgbOffset = 0; targetOffset < result.length; targetOffset += 4, rgbOffset += 3) {
    result[targetOffset] = proofed[rgbOffset] ?? 0
    result[targetOffset + 1] = proofed[rgbOffset + 1] ?? 0
    result[targetOffset + 2] = proofed[rgbOffset + 2] ?? 0
    result[targetOffset + 3] = source[targetOffset + 3] ?? 0
  }
  return result
}
