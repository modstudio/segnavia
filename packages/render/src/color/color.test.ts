import { describe, expect, test } from 'bun:test'
import * as reference from 'lcms-wasm'
import { fromPress, proof, toPress } from './engine.ts'
import { outOfGamut } from './gamut.ts'
import { readProfile } from './profile.ts'
import { buildPressProfile } from './profile-fixture.test-helper.ts'
import { buildProofTable, fastProof, proofPixels } from './proof.ts'
import { checked, color3, color4 } from './types.ts'

const lcms = await reference.instantiate()
const models = [
  { name: 'mft1', bytes: buildPressProfile('mft1') },
  { name: 'mft2', bytes: buildPressProfile('mft2') },
  { name: 'light black', bytes: buildPressProfile('mft2', 0.16) },
]

function grid(dimensions: number, divisions: number): number[][] {
  const result: number[][] = []
  const visit = (values: number[]): void => {
    if (values.length === dimensions) result.push(values)
    else for (let index = 0; index < divisions; index++) visit([...values, index / (divisions - 1)])
  }
  visit([])
  return result
}

function errors(ours: readonly (readonly number[])[], oracle: ArrayLike<number>, channels: number, oracleScale: number): number[][] {
  return Array.from({ length: channels }, (_, channel) =>
    ours
      .map((values, index) =>
        Math.abs(checked(values, channel, 'engine result') * 255 - checked(oracle, index * channels + channel, 'LittleCMS result') * oracleScale),
      )
      .sort((a, b) => a - b),
  )
}

function expectWithinBar(values: number[][]): void {
  for (const channel of values) {
    expect(channel[Math.ceil(channel.length * 0.99) - 1]).toBeLessThanOrEqual(1)
    expect(channel.at(-1)).toBeLessThanOrEqual(3)
  }
}

describe('press color against LittleCMS', () => {
  for (const model of models)
    test(model.name, () => {
      const profile = readProfile(model.bytes)
      const press = lcms.cmsOpenProfileFromMem(model.bytes, model.bytes.length)
      expect(press).not.toBe(0)
      const srgb = lcms.cmsCreate_sRGBProfile()
      const flags = reference.cmsFLAGS_BLACKPOINTCOMPENSATION | reference.cmsFLAGS_NOOPTIMIZE | reference.cmsFLAGS_NOCACHE
      const forward = lcms.cmsCreateTransform(
        srgb,
        reference.TYPE_RGB_DBL | 4,
        press,
        reference.TYPE_CMYK_DBL | 4,
        reference.INTENT_RELATIVE_COLORIMETRIC,
        flags,
      )
      const reverse = lcms.cmsCreateTransform(
        press,
        reference.TYPE_CMYK_DBL | 4,
        srgb,
        reference.TYPE_RGB_DBL | 4,
        reference.INTENT_RELATIVE_COLORIMETRIC,
        flags,
      )
      const rgb = grid(3, 9),
        cmyk = grid(4, 5)
      const oracleTo = lcms.cmsDoTransform(forward, Float32Array.from(rgb.flat()), rgb.length)
      const oracleFrom = lcms.cmsDoTransform(
        reverse,
        Float32Array.from(cmyk.flat(), (value) => value * 100),
        cmyk.length,
      )
      expectWithinBar(
        errors(
          rgb.map((value) => toPress(profile, color3(value, 'RGB grid point'))),
          oracleTo,
          4,
          2.55,
        ),
      )
      expectWithinBar(
        errors(
          cmyk.map((value) => fromPress(profile, color4(value, 'CMYK grid point'))),
          oracleFrom,
          3,
          255,
        ),
      )
      lcms.cmsDeleteTransform(forward)
      lcms.cmsDeleteTransform(reverse)
      lcms.cmsCloseProfile(srgb)
      lcms.cmsCloseProfile(press)
    })
})

test('the light-black model exercises black point compensation', () => {
  const profile = readProfile(checked(models, 2, 'profile models').bytes)
  expect(profile.destinationBlackPoint[0]).toBeGreaterThan(5)
  expect(toPress(profile, [0, 0, 0]).every(Number.isFinite)).toBe(true)
})

test('fast proof stays close to exact proof', () => {
  const profile = readProfile(checked(models, 1, 'profile models').bytes),
    table = buildProofTable(profile)
  let seed = 0x5e6e61
  for (let index = 0; index < 400; index++) {
    const rgb = color3(
      Array.from({ length: 3 }, () => {
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        return (seed >>> 0) / 4_294_967_295
      }),
      'random RGB sample',
    )
    // A 65-point table measured below 2.3 bytes on this fixed sample; three bytes include float and platform variation.
    const exact = proof(profile, rgb)
    expect(Math.max(...fastProof(table, rgb).map((value, channel) => Math.abs(value - checked(exact, channel, 'exact proof')) * 255))).toBeLessThanOrEqual(3)
  }
  expect(proofPixels(table, Uint8Array.from([0, 127, 255]))).toHaveLength(3)
})

test('gamut tolerance is caller-supplied', () => {
  expect(typeof outOfGamut(readProfile(checked(models, 0, 'profile models').bytes), [1, 0, 0], 2)).toBe('boolean')
})

test('refusals identify every unsupported profile property', () => {
  const cases: Array<[number, number[] | string, RegExp]> = [
    [8, [5], /ICC version 5/],
    [12, 'scnr', /profile class "scnr"/],
    [16, 'GRAY', /color space "GRAY"/],
    [20, 'Luv ', /PCS "Luv "/],
  ]
  for (const [offset, replacement, message] of cases) {
    const bytes = checked(models, 0, 'profile models').bytes.slice()
    bytes.set(typeof replacement === 'string' ? new TextEncoder().encode(replacement) : replacement, offset)
    expect(() => readProfile(bytes)).toThrow(message)
  }
  const truncated = checked(models, 0, 'profile models').bytes.slice(0, 140)
  expect(() => readProfile(truncated)).toThrow(/truncated tag table/)
  const tagType = checked(models, 0, 'profile models').bytes.slice(),
    view = new DataView(tagType.buffer),
    firstOffset = view.getUint32(136, false)
  tagType.set(new TextEncoder().encode('xxxx'), firstOffset)
  expect(() => readProfile(tagType)).toThrow(/A2B0 tag type "xxxx"/)
  const curve = tagType.slice()
  curve.set(new TextEncoder().encode('para'), firstOffset)
  expect(() => readProfile(curve)).toThrow(/A2B0 tag type "para"/)
  const channels = checked(models, 0, 'profile models').bytes.slice()
  channels[firstOffset + 8] = 3
  expect(() => readProfile(channels)).toThrow(/A2B0 channel count 3->3/)
  const precision = checked(models, 0, 'profile models').bytes.slice(),
    precisionView = new DataView(precision.buffer)
  precision.set(new TextEncoder().encode('mAB '), firstOffset)
  for (const relativeOffset of [12, 16, 20, 28]) precisionView.setUint32(firstOffset + relativeOffset, 0, false)
  precisionView.setUint32(firstOffset + 24, 32, false)
  precision[firstOffset + 8] = 4
  precision[firstOffset + 9] = 3
  precision.fill(2, firstOffset + 32, firstOffset + 36)
  precision[firstOffset + 48] = 3
  expect(() => readProfile(precision)).toThrow(/mAB {2}CLUT precision 3/)

  const curveType = precision.slice(),
    curveView = new DataView(curveType.buffer)
  curveView.setUint32(firstOffset + 12, 32, false)
  curveView.setUint32(firstOffset + 24, 0, false)
  curveType.set(new TextEncoder().encode('xxxx'), firstOffset + 32)
  expect(() => readProfile(curveType)).toThrow(/curve tag type "xxxx"/)
})
