import { type Color3, type ColorTable, clamp, type Matrix3, refuse } from './types.ts'

export const D50 = [0.9642, 1, 0.8249] as const

export function matrix3(matrix: Matrix3, input: Color3): Color3 {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix
  const [x, y, z] = input
  return [m0 * x + m1 * y + m2 * z, m3 * x + m4 * y + m5 * z, m6 * x + m7 * y + m8 * z]
}

export function tryInvert3(m: Matrix3): Matrix3 | undefined {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = m
  const determinant = m0 * (m4 * m8 - m5 * m7) - m1 * (m3 * m8 - m5 * m6) + m2 * (m3 * m7 - m4 * m6)
  if (Math.abs(determinant) < 1e-12) return undefined
  return [
    (m4 * m8 - m5 * m7) / determinant,
    (m2 * m7 - m1 * m8) / determinant,
    (m1 * m5 - m2 * m4) / determinant,
    (m5 * m6 - m3 * m8) / determinant,
    (m0 * m8 - m2 * m6) / determinant,
    (m2 * m3 - m0 * m5) / determinant,
    (m3 * m7 - m4 * m6) / determinant,
    (m1 * m6 - m0 * m7) / determinant,
    (m0 * m4 - m1 * m3) / determinant,
  ]
}

export function invert3(m: Matrix3): Matrix3 {
  return tryInvert3(m) ?? refuse('singular RGB colorant matrix', 'an invertible rXYZ/gXYZ/bXYZ matrix')
}

export function labToXyz(lab: Color3): Color3 {
  const [lightness, a, b] = lab
  const fy = (lightness + 16) / 116
  const convert = (value: number, white: number) => white * (value ** 3 > 216 / 24_389 ? value ** 3 : (116 * value - 16) / 903.3)
  return [convert(fy + a / 500, D50[0]), convert(fy, D50[1]), convert(fy - b / 200, D50[2])]
}

export function xyzToLab(xyz: Color3): Color3 {
  const convert = (value: number, white: number) => {
    const ratio = value / white
    return ratio > 216 / 24_389 ? Math.cbrt(ratio) : (903.3 * ratio + 16) / 116
  }
  const [x, y, z] = xyz
  const fx = convert(x, D50[0]),
    fy = convert(y, D50[1]),
    fz = convert(z, D50[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function decodePcs(pcs: 'Lab ' | 'XYZ ', encoded: Color3): Color3 {
  const [x, y, z] = encoded
  return pcs === 'Lab ' ? [x * 100, y * 255 - 128, z * 255 - 128] : [x * (65_535 / 32_768), y * (65_535 / 32_768), z * (65_535 / 32_768)]
}

export function encodePcs(pcs: 'Lab ' | 'XYZ ', value: Color3): Color3 {
  const [x, y, z] = value
  return pcs === 'Lab '
    ? [clamp(x / 100), clamp((y + 128) / 255), clamp((z + 128) / 255)]
    : [clamp(x * (32_768 / 65_535)), clamp(y * (32_768 / 65_535)), clamp(z * (32_768 / 65_535))]
}

export function tableEncode(pcs: 'Lab ' | 'XYZ ', encoding: ColorTable['encoding'], major: number, value: Color3, clipped: boolean): Color3 {
  const [x, y, z] = value
  const encoded: Color3 = pcs === 'Lab ' ? [x / 100, (y + 128) / 255, (z + 128) / 255] : [x * (32_768 / 65_535), y * (32_768 / 65_535), z * (32_768 / 65_535)]
  const prepared: Color3 = clipped ? [clamp(encoded[0]), clamp(encoded[1]), clamp(encoded[2])] : encoded
  if (pcs !== 'Lab ' || encoding !== 'mft2' || major !== 2) return prepared
  const scale = 65_280 / 65_535
  return [prepared[0] * scale, prepared[1] * scale, prepared[2] * scale]
}

export function tableDecode(pcs: 'Lab ' | 'XYZ ', encoding: ColorTable['encoding'], major: number, value: Color3): Color3 {
  const scale = pcs === 'Lab ' && encoding === 'mft2' && major === 2 ? 65_535 / 65_280 : 1
  return decodePcs(pcs, [value[0] * scale, value[1] * scale, value[2] * scale])
}

const TO_D50: Matrix3 = [1.0478112, 0.0228866, -0.050127, 0.0295424, 0.9904844, -0.0170491, -0.0092345, 0.0150436, 0.7521316]
const FROM_D50: Matrix3 = [0.9555766, -0.0230393, 0.0631636, -0.0282895, 1.0099416, 0.0210077, 0.0122982, -0.020483, 1.3299098]
const SRGB_TO_XYZ: Matrix3 = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041]
const XYZ_TO_SRGB: Matrix3 = [3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259, 1.0572252]

export function srgbToLab(rgb: Color3): Color3 {
  const convert = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const [red, green, blue] = rgb
  return xyzToLab(matrix3(TO_D50, matrix3(SRGB_TO_XYZ, [convert(red), convert(green), convert(blue)])))
}

export function labToLinearSrgb(lab: Color3): Color3 {
  return matrix3(XYZ_TO_SRGB, matrix3(FROM_D50, labToXyz(lab)))
}

export function linearToSrgb(value: number): number {
  return clamp(value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)
}

export const labToSrgb = (lab: Color3): Color3 => {
  const [red, green, blue] = labToLinearSrgb(lab)
  return [linearToSrgb(red), linearToSrgb(green), linearToSrgb(blue)]
}
