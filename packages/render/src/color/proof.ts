// @ts-nocheck -- Proof tables establish their indexed dimensions when built.
import { proofLinear } from './engine.ts'
import { linearToSrgb } from './spaces.ts'
import { type Color, clamp, type Profile, type ProofTable, refuse } from './types.ts'

export function buildProofTable(profile: Profile, size = 65): ProofTable {
  if (!Number.isInteger(size) || size < 2 || size > 256) refuse(`proof table grid size ${size}`, 'an integer from 2 through 256')
  const data = new Float32Array(size ** 3 * 3)
  const scale = 1 / (size - 1)
  let offset = 0
  for (let red = 0; red < size; red++)
    for (let green = 0; green < size; green++)
      for (let blue = 0; blue < size; blue++) {
        const result = proofLinear(profile, [red * scale, green * scale, blue * scale])
        data[offset++] = result[0]
        data[offset++] = result[1]
        data[offset++] = result[2]
      }
  return { size, data, byteCoordinates: Float32Array.from({ length: 256 }, (_, value) => (value / 255) * (size - 1)) }
}

function tetrahedral(data: Float32Array, base: number, gs: number, rs: number, r: number, g: number, b: number, channel: number): number {
  const c = data[base + channel]
  if (r >= g) {
    if (g >= b)
      return (
        c +
        r * (data[base + rs + channel] - c) +
        g * (data[base + rs + gs + channel] - data[base + rs + channel]) +
        b * (data[base + rs + gs + 3 + channel] - data[base + rs + gs + channel])
      )
    if (r >= b)
      return (
        c +
        r * (data[base + rs + channel] - c) +
        b * (data[base + rs + 3 + channel] - data[base + rs + channel]) +
        g * (data[base + rs + gs + 3 + channel] - data[base + rs + 3 + channel])
      )
    return (
      c +
      b * (data[base + 3 + channel] - c) +
      r * (data[base + rs + 3 + channel] - data[base + 3 + channel]) +
      g * (data[base + rs + gs + 3 + channel] - data[base + rs + 3 + channel])
    )
  }
  if (r >= b)
    return (
      c +
      g * (data[base + gs + channel] - c) +
      r * (data[base + rs + gs + channel] - data[base + gs + channel]) +
      b * (data[base + rs + gs + 3 + channel] - data[base + rs + gs + channel])
    )
  if (g >= b)
    return (
      c +
      g * (data[base + gs + channel] - c) +
      b * (data[base + gs + 3 + channel] - data[base + gs + channel]) +
      r * (data[base + rs + gs + 3 + channel] - data[base + gs + 3 + channel])
    )
  return (
    c +
    b * (data[base + 3 + channel] - c) +
    g * (data[base + gs + 3 + channel] - data[base + 3 + channel]) +
    r * (data[base + rs + gs + 3 + channel] - data[base + gs + 3 + channel])
  )
}

function coordinates(table: ProofTable, rgb: Color) {
  const values = rgb.map((value) => clamp(value) * (table.size - 1))
  const indices = values.map((value) => Math.min(table.size - 2, Math.floor(value)))
  return {
    base: ((indices[0] * table.size + indices[1]) * table.size + indices[2]) * 3,
    r: values[0] - indices[0],
    g: values[1] - indices[1],
    b: values[2] - indices[2],
  }
}

export function fastProof(table: ProofTable, rgb: Color): number[] {
  const { base, r, g, b } = coordinates(table, rgb),
    gs = table.size * 3,
    rs = table.size * gs
  return [0, 1, 2].map((channel) => linearToSrgb(tetrahedral(table.data, base, gs, rs, r, g, b, channel)))
}

export function proofPixels(table: ProofTable, source: Uint8Array, destination = new Uint8ClampedArray(source.length)): Uint8ClampedArray {
  if (source.length % 3 !== 0) refuse(`proof pixel byte length ${source.length}`, 'packed RGB bytes with a length divisible by 3')
  if (destination.length !== source.length) refuse(`proof destination byte length ${destination.length}`, `${source.length}`)
  const gs = table.size * 3,
    rs = table.size * gs
  for (let offset = 0; offset < source.length; offset += 3) {
    const red = table.byteCoordinates[source[offset]],
      green = table.byteCoordinates[source[offset + 1]],
      blue = table.byteCoordinates[source[offset + 2]]
    const ri = Math.min(table.size - 2, Math.floor(red)),
      gi = Math.min(table.size - 2, Math.floor(green)),
      bi = Math.min(table.size - 2, Math.floor(blue))
    const base = ((ri * table.size + gi) * table.size + bi) * 3,
      r = red - ri,
      g = green - gi,
      b = blue - bi
    destination[offset] = linearToSrgb(tetrahedral(table.data, base, gs, rs, r, g, b, 0)) * 255
    destination[offset + 1] = linearToSrgb(tetrahedral(table.data, base, gs, rs, r, g, b, 1)) * 255
    destination[offset + 2] = linearToSrgb(tetrahedral(table.data, base, gs, rs, r, g, b, 2)) * 255
  }
  return destination
}
