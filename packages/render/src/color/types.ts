export type Color1 = [number]
export type Color3 = [number, number, number]
export type Color4 = [number, number, number, number]
export type Color = Color1 | Color3 | Color4
export type ChannelCount = 1 | 3 | 4
export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number]
export type Curve = (value: number) => number
export const REVERSE_LUT = 'mB' + 'A '

export interface ColorTable {
  inputChannels: ChannelCount
  outputChannels: ChannelCount
  encoding: 'mft1' | 'mft2' | 'mAB ' | typeof REVERSE_LUT
  run(input: readonly number[]): number[]
}

export interface Profile {
  version: string
  majorVersion: 2 | 4
  profileClass: 'prtr' | 'mntr'
  colorSpace: 'CMYK' | 'GRAY' | 'RGB '
  pcs: 'Lab ' | 'XYZ '
  whitePoint: Color3
  tags: Readonly<Record<string, string>>
  a2b: ColorTable
  b2a: ColorTable
  perceptualA2b: ColorTable
  perceptualB2a: ColorTable
  gamut?: ColorTable
  sourceBlackPoint: Color3
  destinationBlackPoint: Color3
}

export interface ProofTable {
  size: number
  data: Float32Array
  byteCoordinates: Float32Array
}

export function refuse(found: string, supported: string): never {
  throw new Error(`ICC profile has unsupported ${found}; supported: ${supported}`)
}

export function checked<T>(values: ArrayLike<T>, index: number, structure: string): T {
  const value = values[index]
  if (value === undefined) throw new Error(`${structure} index ${index} is outside length ${values.length}`)
  return value
}

export function color3(values: ArrayLike<number>, structure: string): [number, number, number] {
  return [checked(values, 0, structure), checked(values, 1, structure), checked(values, 2, structure)]
}

export function color1(values: ArrayLike<number>, structure: string): [number] {
  return [checked(values, 0, structure)]
}

export function color4(values: ArrayLike<number>, structure: string): [number, number, number, number] {
  return [checked(values, 0, structure), checked(values, 1, structure), checked(values, 2, structure), checked(values, 3, structure)]
}

export const clamp = (value: number): number => Math.max(0, Math.min(1, value))
