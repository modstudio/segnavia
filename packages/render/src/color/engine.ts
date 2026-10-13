import { compensateBlackPoint } from './black-point.ts'
import { decodePcs, encodePcs, labToLinearSrgb, labToSrgb, labToXyz, srgbToLab, xyzToLab } from './spaces.ts'
import { type Color3, type Color4, type ColorTable, clamp, color3, color4, type Profile, refuse } from './types.ts'

function tableEncode(profile: Profile, table: ColorTable, value: Color3): Color3 {
  const encoded = encodePcs(profile.pcs, value)
  if (profile.pcs !== 'Lab ' || table.encoding !== 'mft2' || profile.majorVersion !== 2) return encoded
  const [x, y, z] = encoded
  return [x * (65_280 / 65_535), y * (65_280 / 65_535), z * (65_280 / 65_535)]
}

function tableDecode(profile: Profile, table: ColorTable, value: Color3): Color3 {
  const encoded: Color3 =
    profile.pcs === 'Lab ' && table.encoding === 'mft2' && profile.majorVersion === 2
      ? [value[0] * (65_535 / 65_280), value[1] * (65_535 / 65_280), value[2] * (65_535 / 65_280)]
      : value
  return decodePcs(profile.pcs, encoded)
}

export function toPress(profile: Profile, rgb: Color3): Color4 {
  if (profile.colorSpace !== 'CMYK') refuse(`destination color space ${profile.colorSpace}`, 'CMYK')
  const lab = compensateBlackPoint(profile, srgbToLab(rgb), false)
  const pcs = profile.pcs === 'Lab ' ? lab : labToXyz(lab)
  const [cyan, magenta, yellow, black] = color4(profile.b2a.run(tableEncode(profile, profile.b2a, pcs)), 'B2A result')
  return [clamp(cyan), clamp(magenta), clamp(yellow), clamp(black)]
}

export function fromPress(profile: Profile, cmyk: Color4): Color3 {
  if (profile.colorSpace !== 'CMYK') refuse(`source color space ${profile.colorSpace}`, 'CMYK')
  const pcs = tableDecode(profile, profile.a2b, color3(profile.a2b.run(cmyk), 'A2B result'))
  return labToSrgb(compensateBlackPoint(profile, profile.pcs === 'Lab ' ? pcs : xyzToLab(pcs), true))
}

export function proof(profile: Profile, rgb: Color3): Color3 {
  return fromPress(profile, toPress(profile, rgb))
}

export function proofLinear(profile: Profile, rgb: Color3): Color3 {
  const pcs = tableDecode(profile, profile.a2b, color3(profile.a2b.run(toPress(profile, rgb)), 'A2B result'))
  return labToLinearSrgb(compensateBlackPoint(profile, profile.pcs === 'Lab ' ? pcs : xyzToLab(pcs), true))
}
