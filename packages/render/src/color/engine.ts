import { compensateBlackPoint } from './black-point.ts'
import { labToLinearSrgb, labToSrgb, labToXyz, srgbToLab, tableDecode, tableEncode, xyzToLab } from './spaces.ts'
import { type Color3, type Color4, clamp, color3, color4, type Profile, refuse } from './types.ts'

export function toPress(profile: Profile, rgb: Color3): Color4 {
  if (profile.colorSpace !== 'CMYK') refuse(`destination color space ${profile.colorSpace}`, 'CMYK')
  const lab = compensateBlackPoint(profile, srgbToLab(rgb), false)
  const pcs = profile.pcs === 'Lab ' ? lab : labToXyz(lab)
  const [cyan, magenta, yellow, black] = color4(profile.b2a.run(tableEncode(profile.pcs, profile.b2a.encoding, profile.majorVersion, pcs, true)), 'B2A result')
  return [clamp(cyan), clamp(magenta), clamp(yellow), clamp(black)]
}

export function fromPress(profile: Profile, cmyk: Color4): Color3 {
  if (profile.colorSpace !== 'CMYK') refuse(`source color space ${profile.colorSpace}`, 'CMYK')
  const pcs = tableDecode(profile.pcs, profile.a2b.encoding, profile.majorVersion, color3(profile.a2b.run(cmyk), 'A2B result'))
  return labToSrgb(compensateBlackPoint(profile, profile.pcs === 'Lab ' ? pcs : xyzToLab(pcs), true))
}

export function proof(profile: Profile, rgb: Color3): Color3 {
  return fromPress(profile, toPress(profile, rgb))
}

export function proofLinear(profile: Profile, rgb: Color3): Color3 {
  const pcs = tableDecode(profile.pcs, profile.a2b.encoding, profile.majorVersion, color3(profile.a2b.run(toPress(profile, rgb)), 'A2B result'))
  return labToLinearSrgb(compensateBlackPoint(profile, profile.pcs === 'Lab ' ? pcs : xyzToLab(pcs), true))
}
