import type { Color, Color3, Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { destinationColor, pdfMaskLuminosity } from './color-policy.ts'
import { indexedSamples } from './image-samples.ts'
import type { MaskContext } from './visitor.ts'

export interface BaseSpace {
  channels: 1 | 3 | 4
  kind: 'cmyk' | 'gray' | 'rgb'
  label: string
  profile?: Uint8Array
}

export interface IndexedSpace {
  base: BaseSpace
  high: number
  kind: 'indexed'
  label: string
  lookup: Uint8Array
}

export type GrayLookup = (red: number, green: number, blue: number) => number
export interface ImageColorState {
  convert: (rgb: Color3) => Color
  destination: 'cmyk' | 'gray'
  grayLookup: Uint8Array
  rgbLookup: GrayLookup
}

const refuse = (found: string, supported: string): never => {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}

export function grayTable(profile: Profile): Uint8Array {
  const table = new Uint8Array(256)
  for (let value = 0; value < 256; value++) table[value] = Math.round(destinationColor(profile, [value / 255, value / 255, value / 255], 0)[0] * 255)
  return table
}

export function buildGrayImageLookup(profile: Profile, size = 33): GrayLookup {
  const table = new Uint8Array(size ** 3)
  const at = (red: number, green: number, blue: number) => (red * size + green) * size + blue
  for (let red = 0; red < size; red++)
    for (let green = 0; green < size; green++)
      for (let blue = 0; blue < size; blue++) {
        const value = destinationColor(profile, [red / (size - 1), green / (size - 1), blue / (size - 1)], 0)[0]
        table[at(red, green, blue)] = Math.round(Math.max(0, Math.min(1, value)) * 255)
      }
  return (red, green, blue) => {
    const scale = (size - 1) / 255
    const r = red * scale,
      g = green * scale,
      b = blue * scale
    const r0 = Math.floor(r),
      g0 = Math.floor(g),
      b0 = Math.floor(b)
    const r1 = Math.min(size - 1, r0 + 1),
      g1 = Math.min(size - 1, g0 + 1),
      b1 = Math.min(size - 1, b0 + 1)
    const rf = r - r0,
      gf = g - g0,
      bf = b - b0
    const mix = (first: number, second: number, amount: number) => first + (second - first) * amount
    const low = mix(mix(table[at(r0, g0, b0)] ?? 0, table[at(r1, g0, b0)] ?? 0, rf), mix(table[at(r0, g1, b0)] ?? 0, table[at(r1, g1, b0)] ?? 0, rf), gf)
    const high = mix(mix(table[at(r0, g0, b1)] ?? 0, table[at(r1, g0, b1)] ?? 0, rf), mix(table[at(r0, g1, b1)] ?? 0, table[at(r1, g1, b1)] ?? 0, rf), gf)
    return Math.round(mix(low, high, bf))
  }
}

function writeProfilePixel(state: ImageColorState, output: Uint8Array, pixel: number, rgb: [number, number, number], gray: boolean, mask: MaskContext): void {
  const [red, green, blue] = rgb
  if (mask !== 'none') {
    output[pixel] = Math.round(pdfMaskLuminosity([red / 255, green / 255, blue / 255])[0] * 255)
    return
  }
  if (state.destination === 'gray') {
    output[pixel] = gray ? (state.grayLookup[red] ?? 0) : state.rgbLookup(red, green, blue)
    return
  }
  const converted = state.convert([red / 255, green / 255, blue / 255])
  for (let channel = 0; channel < 4; channel++) output[pixel * 4 + channel] = Math.round(Math.max(0, Math.min(1, converted[channel] ?? 0)) * 255)
}

export function profileRgb(state: ImageColorState, source: Uint8Array, space: BaseSpace, mask: MaskContext, pixels: number): Uint8Array {
  const expected = pixels * space.channels
  if (source.length !== expected) refuse(`image sample length ${source.length}`, `${expected} bytes for its dimensions and color space`)
  const output = new Uint8Array(pixels * (mask === 'none' && state.destination === 'cmyk' ? 4 : 1))
  for (let pixel = 0; pixel < pixels; pixel++) {
    const first = source[pixel * space.channels] ?? 0
    const rgb: [number, number, number] = [
      first,
      space.channels === 1 ? first : (source[pixel * 3 + 1] ?? 0),
      space.channels === 1 ? first : (source[pixel * 3 + 2] ?? 0),
    ]
    writeProfilePixel(state, output, pixel, rgb, space.kind === 'gray', mask)
  }
  return output
}

export function paletteToGray(state: ImageColorState, space: IndexedSpace, mask: MaskContext): Uint8Array {
  const expected = (space.high + 1) * space.base.channels
  if (!Number.isInteger(space.high) || space.high < 0 || space.high > 255 || space.lookup.length < expected)
    refuse(`Indexed image lookup length ${space.lookup.length}`, `${expected} bytes for entries 0 through ${space.high}`)
  return profileRgb(state, space.lookup.subarray(0, expected), space.base, mask, space.high + 1)
}

export function indexedToProfile(
  state: ImageColorState,
  source: Uint8Array,
  space: IndexedSpace,
  mask: MaskContext,
  width: number,
  height: number,
  bits: number,
): Uint8Array {
  const palette = paletteToGray(state, space, mask)
  const channels = mask === 'none' && state.destination === 'cmyk' ? 4 : 1
  const indices = indexedSamples(source, width, height, bits)
  const output = new Uint8Array(width * height * channels)
  for (let pixel = 0; pixel < indices.length; pixel++) {
    const index = indices[pixel] ?? 0
    for (let channel = 0; channel < channels; channel++) output[pixel * channels + channel] = palette[index * channels + channel] ?? 0
  }
  return output
}
