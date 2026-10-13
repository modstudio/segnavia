import { proofLinear } from './engine.ts'
import { linearToSrgb } from './spaces.ts'
import { type Color3, clamp, type Profile, type ProofTable, refuse } from './types.ts'

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
  const last = base + rs + gs + 3 + channel
  if (base < 0 || channel < 0 || channel > 2 || last >= data.length) throw new Error(`proof table interpolation index ${last} is outside length ${data.length}`)
  // The range check above establishes every corner index; fallbacks keep the hot interpolation loop compatible with noUncheckedIndexedAccess.
  const c = data[base + channel] ?? 0,
    cr = data[base + rs + channel] ?? 0,
    cg = data[base + gs + channel] ?? 0,
    cb = data[base + 3 + channel] ?? 0,
    crg = data[base + rs + gs + channel] ?? 0,
    crb = data[base + rs + 3 + channel] ?? 0,
    cgb = data[base + gs + 3 + channel] ?? 0,
    crgb = data[last] ?? 0
  if (r >= g) {
    if (g >= b) return c + r * (cr - c) + g * (crg - cr) + b * (crgb - crg)
    if (r >= b) return c + r * (cr - c) + b * (crb - cr) + g * (crgb - crb)
    return c + b * (cb - c) + r * (crb - cb) + g * (crgb - crb)
  }
  if (r >= b) return c + g * (cg - c) + r * (crg - cg) + b * (crgb - crg)
  if (g >= b) return c + g * (cg - c) + b * (cgb - cg) + r * (crgb - cgb)
  return c + b * (cb - c) + g * (cgb - cb) + r * (crgb - cgb)
}

function coordinates(table: ProofTable, rgb: Color3) {
  const [red, green, blue] = rgb
  const scale = table.size - 1
  const rValue = clamp(red) * scale,
    gValue = clamp(green) * scale,
    bValue = clamp(blue) * scale
  const ri = Math.min(table.size - 2, Math.floor(rValue)),
    gi = Math.min(table.size - 2, Math.floor(gValue)),
    bi = Math.min(table.size - 2, Math.floor(bValue))
  return {
    base: ((ri * table.size + gi) * table.size + bi) * 3,
    r: rValue - ri,
    g: gValue - gi,
    b: bValue - bi,
  }
}

export function fastProof(table: ProofTable, rgb: Color3): Color3 {
  const { base, r, g, b } = coordinates(table, rgb),
    gs = table.size * 3,
    rs = table.size * gs
  return [
    linearToSrgb(tetrahedral(table.data, base, gs, rs, r, g, b, 0)),
    linearToSrgb(tetrahedral(table.data, base, gs, rs, r, g, b, 1)),
    linearToSrgb(tetrahedral(table.data, base, gs, rs, r, g, b, 2)),
  ]
}

export function proofPixels(table: ProofTable, source: Uint8Array, destination = new Uint8ClampedArray(source.length)): Uint8ClampedArray {
  if (source.length % 3 !== 0) refuse(`proof pixel byte length ${source.length}`, 'packed RGB bytes with a length divisible by 3')
  if (destination.length !== source.length) refuse(`proof destination byte length ${destination.length}`, `${source.length}`)
  const gs = table.size * 3,
    rs = table.size * gs
  for (let offset = 0; offset < source.length; offset += 3) {
    // Divisibility and loop bounds above establish all three source indices; byte coordinates always contain 256 entries.
    const red = table.byteCoordinates[source[offset] ?? 0] ?? 0,
      green = table.byteCoordinates[source[offset + 1] ?? 0] ?? 0,
      blue = table.byteCoordinates[source[offset + 2] ?? 0] ?? 0
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
