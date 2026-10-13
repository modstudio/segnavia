// @ts-nocheck -- Color vectors have fixed dimensions at internal call sites.
import { type Color, clamp } from './types.ts'

export const D50 = [0.9642, 1, 0.8249] as const

export function matrix3(matrix: Color, input: Color): number[] {
  return [0, 1, 2].map((row) => matrix[row * 3] * input[0] + matrix[row * 3 + 1] * input[1] + matrix[row * 3 + 2] * input[2])
}

export function invert3(m: Color): number[] {
  const determinant = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
  if (Math.abs(determinant) < 1e-12) throw new Error('ICC profile has unsupported singular RGB colorant matrix; supported: an invertible rXYZ/gXYZ/bXYZ matrix')
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ].map((value) => value / determinant)
}

export function labToXyz(lab: Color): number[] {
  const fy = (lab[0] + 16) / 116
  const f = [fy + lab[1] / 500, fy, fy - lab[2] / 200]
  return f.map((value, index) => D50[index] * (value ** 3 > 216 / 24_389 ? value ** 3 : (116 * value - 16) / 903.3))
}

export function xyzToLab(xyz: Color): number[] {
  const f = xyz.map((value, index) => {
    const ratio = value / D50[index]
    return ratio > 216 / 24_389 ? Math.cbrt(ratio) : (903.3 * ratio + 16) / 116
  })
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])]
}

export function decodePcs(pcs: 'Lab ' | 'XYZ ', encoded: Color): number[] {
  return pcs === 'Lab ' ? [encoded[0] * 100, encoded[1] * 255 - 128, encoded[2] * 255 - 128] : encoded.map((value) => value * (65_535 / 32_768))
}

export function encodePcs(pcs: 'Lab ' | 'XYZ ', value: Color): number[] {
  return pcs === 'Lab ' ? [value[0] / 100, (value[1] + 128) / 255, (value[2] + 128) / 255].map(clamp) : value.map((item) => clamp(item * (32_768 / 65_535)))
}

const TO_D50 = [1.0478112, 0.0228866, -0.050127, 0.0295424, 0.9904844, -0.0170491, -0.0092345, 0.0150436, 0.7521316]
const FROM_D50 = [0.9555766, -0.0230393, 0.0631636, -0.0282895, 1.0099416, 0.0210077, 0.0122982, -0.020483, 1.3299098]

export function srgbToLab(rgb: Color): number[] {
  const linear = rgb.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return xyzToLab(matrix3(TO_D50, matrix3([0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041], linear)))
}

export function labToLinearSrgb(lab: Color): number[] {
  return matrix3([3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259, 1.0572252], matrix3(FROM_D50, labToXyz(lab)))
}

export function linearToSrgb(value: number): number {
  return clamp(value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)
}

export const labToSrgb = (lab: Color): number[] => labToLinearSrgb(lab).map(linearToSrgb)
