import { compensateBlackPoint } from './black-point.ts'
import { labToLinearSrgb, labToSrgb, labToXyz, srgbToLab, tableDecode, tableEncode, xyzToLab } from './spaces.ts'
import { type Color1, type Color3, type Color4, clamp, color1, color3, color4, type Profile, refuse } from './types.ts'

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

export function toGray(profile: Profile, rgb: Color3): Color1 {
  if (profile.colorSpace !== 'GRAY') refuse(`destination color space ${profile.colorSpace}`, 'GRAY')
  const lab = compensateBlackPoint(profile, srgbToLab(rgb), false)
  const pcs = profile.pcs === 'Lab ' ? lab : labToXyz(lab)
  const [gray] = color1(profile.b2a.run(tableEncode(profile.pcs, profile.b2a.encoding, profile.majorVersion, pcs, true)), 'B2A result')
  return [clamp(gray)]
}

export function fromGray(profile: Profile, gray: Color1): Color3 {
  if (profile.colorSpace !== 'GRAY') refuse(`source color space ${profile.colorSpace}`, 'GRAY')
  const pcs = tableDecode(profile.pcs, profile.a2b.encoding, profile.majorVersion, color3(profile.a2b.run(gray), 'A2B result'))
  return labToSrgb(compensateBlackPoint(profile, profile.pcs === 'Lab ' ? pcs : xyzToLab(pcs), true))
}

export function proof(profile: Profile, rgb: Color3): Color3 {
  return profile.colorSpace === 'GRAY' ? fromGray(profile, toGray(profile, rgb)) : fromPress(profile, toPress(profile, rgb))
}

export function proofLinear(profile: Profile, rgb: Color3): Color3 {
  const device = profile.colorSpace === 'GRAY' ? toGray(profile, rgb) : toPress(profile, rgb)
  const pcs = tableDecode(profile.pcs, profile.a2b.encoding, profile.majorVersion, color3(profile.a2b.run(device), 'A2B result'))
  return labToLinearSrgb(compensateBlackPoint(profile, profile.pcs === 'Lab ' ? pcs : xyzToLab(pcs), true))
}
