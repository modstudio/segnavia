// @ts-nocheck -- Profile and color dimensions are established at the edge.
import { compensateBlackPoint } from './black-point.ts'
import { decodePcs, encodePcs, labToLinearSrgb, labToSrgb, labToXyz, srgbToLab, xyzToLab } from './spaces.ts'
import { type Color, type ColorTable, clamp, type Profile, refuse } from './types.ts'

function tableEncode(profile: Profile, table: ColorTable, value: Color): number[] {
  const encoded = encodePcs(profile.pcs, value)
  return profile.pcs === 'Lab ' && table.encoding === 'mft2' && profile.majorVersion === 2 ? encoded.map((item) => item * (65_280 / 65_535)) : encoded
}

function tableDecode(profile: Profile, table: ColorTable, value: Color): number[] {
  const encoded = profile.pcs === 'Lab ' && table.encoding === 'mft2' && profile.majorVersion === 2 ? value.map((item) => item * (65_535 / 65_280)) : [...value]
  return decodePcs(profile.pcs, encoded)
}

export function toPress(profile: Profile, rgb: Color): number[] {
  if (profile.colorSpace !== 'CMYK') refuse(`destination color space ${profile.colorSpace}`, 'CMYK')
  const lab = compensateBlackPoint(profile, srgbToLab(rgb), false)
  const pcs = profile.pcs === 'Lab ' ? lab : labToXyz(lab)
  return profile.b2a.run(tableEncode(profile, profile.b2a, pcs)).map(clamp)
}

export function fromPress(profile: Profile, cmyk: Color): number[] {
  if (profile.colorSpace !== 'CMYK') refuse(`source color space ${profile.colorSpace}`, 'CMYK')
  const pcs = tableDecode(profile, profile.a2b, profile.a2b.run(cmyk))
  return labToSrgb(compensateBlackPoint(profile, profile.pcs === 'Lab ' ? pcs : xyzToLab(pcs), true))
}

export function proof(profile: Profile, rgb: Color): number[] {
  return fromPress(profile, toPress(profile, rgb))
}

export function proofLinear(profile: Profile, rgb: Color): number[] {
  const pcs = tableDecode(profile, profile.a2b, profile.a2b.run(toPress(profile, rgb)))
  return labToLinearSrgb(compensateBlackPoint(profile, profile.pcs === 'Lab ' ? pcs : xyzToLab(pcs), true))
}
