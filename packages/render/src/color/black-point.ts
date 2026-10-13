// Copyright (c) 2023 Marti Maria Saguer
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject
// to the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// detectSourceBlackPoint, destinationBlackPoint, and quadraticRoot translate
// BlackPointUsingPerceptualBlack and cmsDetectDestinationBlackPoint from
// LittleCMS cmssamp.c; compensateBlackPoint translates
// ComputeBlackPointCompensation from LittleCMS cmscnvrt.c.

import { D50, labToXyz, matrix3, xyzToLab } from './spaces.ts'
import { type Color3, type ColorTable, checked, type Matrix3, type Profile } from './types.ts'

function encode(pcs: Profile['pcs'], table: ColorTable, major: number, value: Color3): Color3 {
  const [x, y, z] = value
  const result: Color3 = pcs === 'Lab ' ? [x / 100, (y + 128) / 255, (z + 128) / 255] : [x * (32_768 / 65_535), y * (32_768 / 65_535), z * (32_768 / 65_535)]
  if (pcs !== 'Lab ' || table.encoding !== 'mft2' || major !== 2) return result
  return [result[0] * (65_280 / 65_535), result[1] * (65_280 / 65_535), result[2] * (65_280 / 65_535)]
}

function decode(pcs: Profile['pcs'], table: ColorTable, major: number, value: Color3): Color3 {
  const encoded: Color3 =
    pcs === 'Lab ' && table.encoding === 'mft2' && major === 2
      ? [value[0] * (65_535 / 65_280), value[1] * (65_535 / 65_280), value[2] * (65_535 / 65_280)]
      : value
  const [x, y, z] = encoded
  return pcs === 'Lab ' ? [x * 100, y * 255 - 128, z * 255 - 128] : [x * (65_535 / 32_768), y * (65_535 / 32_768), z * (65_535 / 32_768)]
}

export function detectSourceBlackPoint(
  colorSpace: Profile['colorSpace'],
  pcs: Profile['pcs'],
  major: number,
  relativeA2b: ColorTable,
  perceptualB2a: ColorTable,
): Color3 {
  if (colorSpace !== 'CMYK') return [0, 0, 0]
  const device = perceptualB2a.run(encode(pcs, perceptualB2a, major, [0, 0, 0]))
  const result = relativeA2b.run(device)
  const returned = decode(pcs, relativeA2b, major, [
    checked(result, 0, 'black-point A2B result'),
    checked(result, 1, 'black-point A2B result'),
    checked(result, 2, 'black-point A2B result'),
  ])
  const lab = pcs === 'Lab ' ? returned : xyzToLab(returned)
  return [Math.min(50, lab[0]), 0, 0]
}

function quadraticRoot(x: number[], y: number[]): number {
  if (x.length < 4) return 0
  let sx = 0,
    sx2 = 0,
    sx3 = 0,
    sx4 = 0,
    sy = 0,
    syx = 0,
    syx2 = 0
  for (const [index, xn] of x.entries()) {
    const yn = checked(y, index, 'quadratic sample')
    sx += xn
    sx2 += xn ** 2
    sx3 += xn ** 3
    sx4 += xn ** 4
    sy += yn
    syx += yn * xn
    syx2 += yn * xn ** 2
  }
  const matrix: Matrix3 = [x.length, sx, sx2, sx, sx2, sx3, sx2, sx3, sx4]
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix
  const determinant = m0 * (m4 * m8 - m5 * m7) - m1 * (m3 * m8 - m5 * m6) + m2 * (m3 * m7 - m4 * m6)
  if (Math.abs(determinant) < 1e-12) return 0
  const inverse: Matrix3 = [
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
  const [c, b, a] = matrix3(inverse, [sy, syx, syx2])
  if (Math.abs(a) < 1e-10) return Math.abs(b) < 1e-10 ? 0 : Math.max(0, Math.min(50, -c / b))
  const discriminant = b * b - 4 * a * c
  return discriminant <= 0 ? 0 : Math.max(0, Math.min(50, (-b + Math.sqrt(discriminant)) / (2 * a)))
}

export function destinationBlackPoint(
  colorSpace: Profile['colorSpace'],
  pcs: Profile['pcs'],
  major: number,
  relativeA2b: ColorTable,
  relativeB2a: ColorTable,
  sourceBlack: Color3,
): Color3 {
  if (colorSpace !== 'CMYK') return [...sourceBlack]
  const inputRamp: number[] = [],
    outputRamp: number[] = []
  for (let index = 0; index < 256; index++) {
    const lightness = (index * 100) / 255
    const lab: Color3 = [lightness, Math.max(-50, Math.min(50, sourceBlack[1])), Math.max(-50, Math.min(50, sourceBlack[2]))]
    const value = pcs === 'Lab ' ? lab : labToXyz(lab)
    const device = relativeB2a.run(encode(pcs, relativeB2a, major, value))
    const run = relativeA2b.run(device)
    const returned = decode(pcs, relativeA2b, major, [
      checked(run, 0, 'black-point A2B result'),
      checked(run, 1, 'black-point A2B result'),
      checked(run, 2, 'black-point A2B result'),
    ])
    inputRamp.push(lightness)
    outputRamp.push(pcs === 'Lab ' ? returned[0] : xyzToLab(returned)[0])
  }
  for (let index = 254; index > 0; index--)
    outputRamp[index] = Math.min(checked(outputRamp, index, 'black-point output ramp'), checked(outputRamp, index + 1, 'black-point output ramp'))
  const minimum = checked(outputRamp, 0, 'black-point output ramp'),
    maximum = checked(outputRamp, 255, 'black-point output ramp')
  if (!(minimum < maximum)) return [0, 0, 0]
  if (
    inputRamp.every(
      (value, index) => value <= minimum + 0.2 * (maximum - minimum) || Math.abs(value - checked(outputRamp, index, 'black-point output ramp')) < 4,
    )
  )
    return [...sourceBlack]
  const x: number[] = [],
    y: number[] = []
  for (let index = 0; index < 256; index++) {
    const normalized = (checked(outputRamp, index, 'black-point output ramp') - minimum) / (maximum - minimum)
    if (normalized >= 0.1 && normalized < 0.5) {
      x.push(checked(inputRamp, index, 'black-point input ramp'))
      y.push(normalized)
    }
  }
  return [x.length < 3 ? 0 : quadraticRoot(x, y), sourceBlack[1], sourceBlack[2]]
}

export function compensateBlackPoint(profile: Profile, lab: Color3, reverse: boolean): Color3 {
  const point = reverse ? profile.sourceBlackPoint : profile.destinationBlackPoint
  const black = profile.pcs === 'Lab ' ? point : xyzToLab(point)
  const blackXyz = labToXyz(black),
    xyz = labToXyz(lab)
  const channel = (value: number, white: number, blackValue: number) => {
    const scale = (white - blackValue) / white
    return reverse ? (value - blackValue) / scale : blackValue + value * scale
  }
  return xyzToLab([channel(xyz[0], D50[0], blackXyz[0]), channel(xyz[1], D50[1], blackXyz[1]), channel(xyz[2], D50[2], blackXyz[2])])
}
