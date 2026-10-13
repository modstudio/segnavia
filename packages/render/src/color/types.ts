// @ts-nocheck -- ICC vectors are validated at the parser boundary.
export type Color = readonly number[]
export type Curve = (value: number) => number
export const M_BA = 'mB' + 'A '

export interface ColorTable {
  inputChannels: number
  outputChannels: number
  encoding: 'mft1' | 'mft2' | 'mAB ' | typeof M_BA
  run(input: Color): number[]
}

export interface Profile {
  version: string
  majorVersion: 2 | 4
  profileClass: 'prtr' | 'mntr'
  colorSpace: 'CMYK' | 'RGB '
  pcs: 'Lab ' | 'XYZ '
  whitePoint: Color
  tags: Readonly<Record<string, string>>
  a2b: ColorTable
  b2a: ColorTable
  perceptualA2b: ColorTable
  perceptualB2a: ColorTable
  gamut?: ColorTable
  sourceBlackPoint: Color
  destinationBlackPoint: Color
}

export interface ProofTable {
  size: number
  data: Float32Array
  byteCoordinates: Float32Array
}

export function refuse(found: string, supported: string): never {
  throw new Error(`ICC profile has unsupported ${found}; supported: ${supported}`)
}

export const clamp = (value: number): number => Math.max(0, Math.min(1, value))
