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
// @ts-nocheck -- Black-point vectors have fixed dimensions inside the engine.
//
// detectSourceBlackPoint, destinationBlackPoint, and quadraticRoot translate
// BlackPointUsingPerceptualBlack and cmsDetectDestinationBlackPoint from
// LittleCMS cmssamp.c; compensateBlackPoint translates
// ComputeBlackPointCompensation from LittleCMS cmscnvrt.c.

import { D50, labToXyz, matrix3, xyzToLab } from './spaces.ts'
import type { Color, ColorTable, Profile } from './types.ts'

function encode(pcs: Profile['pcs'], table: ColorTable, major: number, value: Color): number[] {
  const result = pcs === 'Lab ' ? [value[0] / 100, (value[1] + 128) / 255, (value[2] + 128) / 255] : value.map((item) => item * (32_768 / 65_535))
  return pcs === 'Lab ' && table.encoding === 'mft2' && major === 2 ? result.map((item) => item * (65_280 / 65_535)) : result
}

function decode(pcs: Profile['pcs'], table: ColorTable, major: number, value: Color): number[] {
  const encoded = pcs === 'Lab ' && table.encoding === 'mft2' && major === 2 ? value.map((item) => item * (65_535 / 65_280)) : [...value]
  return pcs === 'Lab ' ? [encoded[0] * 100, encoded[1] * 255 - 128, encoded[2] * 255 - 128] : encoded.map((item) => item * (65_535 / 32_768))
}

export function detectSourceBlackPoint(
  colorSpace: Profile['colorSpace'],
  pcs: Profile['pcs'],
  major: number,
  relativeA2b: ColorTable,
  perceptualB2a: ColorTable,
): number[] {
  if (colorSpace !== 'CMYK') return [0, 0, 0]
  const returned = decode(pcs, relativeA2b, major, relativeA2b.run(perceptualB2a.run(encode(pcs, perceptualB2a, major, [0, 0, 0]))))
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
  for (let index = 0; index < x.length; index++) {
    const xn = x[index],
      yn = y[index]
    sx += xn
    sx2 += xn ** 2
    sx3 += xn ** 3
    sx4 += xn ** 4
    sy += yn
    syx += yn * xn
    syx2 += yn * xn ** 2
  }
  const matrix = [x.length, sx, sx2, sx, sx2, sx3, sx2, sx3, sx4]
  const determinant =
    matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
    matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6]) +
    matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
  if (Math.abs(determinant) < 1e-12) return 0
  const inverse = [
    matrix[4] * matrix[8] - matrix[5] * matrix[7],
    matrix[2] * matrix[7] - matrix[1] * matrix[8],
    matrix[1] * matrix[5] - matrix[2] * matrix[4],
    matrix[5] * matrix[6] - matrix[3] * matrix[8],
    matrix[0] * matrix[8] - matrix[2] * matrix[6],
    matrix[2] * matrix[3] - matrix[0] * matrix[5],
    matrix[3] * matrix[7] - matrix[4] * matrix[6],
    matrix[1] * matrix[6] - matrix[0] * matrix[7],
    matrix[0] * matrix[4] - matrix[1] * matrix[3],
  ].map((value) => value / determinant)
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
  sourceBlack: Color,
): number[] {
  if (colorSpace !== 'CMYK') return [...sourceBlack]
  const inputRamp: number[] = [],
    outputRamp: number[] = []
  for (let index = 0; index < 256; index++) {
    const lightness = (index * 100) / 255
    const lab = [lightness, Math.max(-50, Math.min(50, sourceBlack[1])), Math.max(-50, Math.min(50, sourceBlack[2]))]
    const value = pcs === 'Lab ' ? lab : labToXyz(lab)
    const device = relativeB2a.run(encode(pcs, relativeB2a, major, value))
    const returned = decode(pcs, relativeA2b, major, relativeA2b.run(device))
    inputRamp.push(lightness)
    outputRamp.push(pcs === 'Lab ' ? returned[0] : xyzToLab(returned)[0])
  }
  for (let index = 254; index > 0; index--) outputRamp[index] = Math.min(outputRamp[index], outputRamp[index + 1])
  if (!(outputRamp[0] < outputRamp[255])) return [0, 0, 0]
  const minimum = outputRamp[0],
    maximum = outputRamp[255]
  if (inputRamp.every((value, index) => value <= minimum + 0.2 * (maximum - minimum) || Math.abs(value - outputRamp[index]) < 4)) return [...sourceBlack]
  const x: number[] = [],
    y: number[] = []
  for (let index = 0; index < 256; index++) {
    const normalized = (outputRamp[index] - minimum) / (maximum - minimum)
    if (normalized >= 0.1 && normalized < 0.5) {
      x.push(inputRamp[index])
      y.push(normalized)
    }
  }
  return [x.length < 3 ? 0 : quadraticRoot(x, y), sourceBlack[1], sourceBlack[2]]
}

export function compensateBlackPoint(profile: Profile, lab: Color, reverse: boolean): number[] {
  const point = reverse ? profile.sourceBlackPoint : profile.destinationBlackPoint
  const black = profile.pcs === 'Lab ' ? point : xyzToLab(point)
  const blackXyz = labToXyz(black),
    xyz = labToXyz(lab)
  return xyzToLab(
    xyz.map((value, channel) => {
      const scale = (D50[channel] - blackXyz[channel]) / D50[channel]
      return reverse ? (value - blackXyz[channel]) / scale : blackXyz[channel] + value * scale
    }),
  )
}
