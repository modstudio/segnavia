import { describe, expect, test } from 'bun:test'
import * as reference from '../../test-fixtures/lcms/reference.ts'
import { fromPress, proof, toPress } from './engine.ts'
import { outOfGamut } from './gamut.ts'
import { MAX_PROFILE_BYTES, readProfile } from './profile.ts'
import { buildPressProfile } from './profile-fixture.test-helper.ts'
import { buildProofTable, fastProof, proofPixels } from './proof.ts'
import { srgbToLab, tableEncode } from './spaces.ts'
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

test('the light-black conversion applies black point compensation', () => {
  const profile = readProfile(checked(models, 2, 'profile models').bytes)
  const withoutCompensation = color4(
    profile.b2a.run(tableEncode(profile.pcs, profile.b2a.encoding, profile.majorVersion, srgbToLab([0, 0, 0]), true)),
    'uncompensated B2A result',
  )
  expect(
    Math.max(...toPress(profile, [0, 0, 0]).map((value, channel) => Math.abs(value - checked(withoutCompensation, channel, 'uncompensated B2A result')))),
  ).toBeGreaterThan(3 / 255)
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

test('gamut tolerance distinguishes a preserved neutral from an unreachable saturated color', () => {
  const profile = readProfile(checked(models, 0, 'profile models').bytes)
  expect(outOfGamut(profile, [1, 1, 1], 2)).toBe(false)
  expect(outOfGamut(profile, [1, 0, 0], 2)).toBe(true)
})

function tagRecord(bytes: Uint8Array, name: string): { at: number; offset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < view.getUint32(128, false); index++) {
    const at = 132 + index * 12
    if (new TextDecoder().decode(bytes.subarray(at, at + 4)) === name) return { at, offset: view.getUint32(at + 4, false) }
  }
  throw new Error(`fixture has no ${name} tag`)
}

test('a profile over the byte ceiling names its size and the ceiling', () => {
  expect(() => readProfile(new Uint8Array(MAX_PROFILE_BYTES + 1))).toThrow(
    `profile length ${MAX_PROFILE_BYTES + 1}; supported: at most ${MAX_PROFILE_BYTES} bytes`,
  )
})

test('a wrong channel count is refused before its table payload is read', () => {
  const bytes = checked(models, 0, 'profile models').bytes.slice(),
    view = new DataView(bytes.buffer),
    record = tagRecord(bytes, 'A2B1')
  view.setUint32(record.at + 8, 48, false)
  bytes[record.offset + 8] = 8
  expect(() => readProfile(bytes)).toThrow(/A2B1 channel count 8->3/)
})

test('a tag cannot read a table beyond its declared size', () => {
  const bytes = checked(models, 0, 'profile models').bytes.slice(),
    view = new DataView(bytes.buffer),
    record = tagRecord(bytes, 'A2B1')
  view.setUint32(record.at + 8, 48, false)
  expect(() => readProfile(bytes)).toThrow(/truncated A2B1 tag/)
})

test('a short white point at the end of the file is refused by its tag bound', () => {
  const bytes = checked(models, 0, 'profile models').bytes.slice(),
    view = new DataView(bytes.buffer),
    record = tagRecord(bytes, 'wtpt')
  view.setUint32(record.at + 8, 16, false)
  expect(() => readProfile(bytes)).toThrow(/truncated wtpt tag/)
})

for (const point of [0, 1])
  test(`an mAB CLUT dimension of ${point} is refused`, () => {
    const bytes = checked(models, 0, 'profile models').bytes.slice(),
      view = new DataView(bytes.buffer),
      record = tagRecord(bytes, 'A2B1')
    bytes.set(new TextEncoder().encode('mAB '), record.offset)
    view.setUint32(record.offset + 12, 0, false)
    view.setUint32(record.offset + 16, 0, false)
    view.setUint32(record.offset + 20, 0, false)
    view.setUint32(record.offset + 24, 32, false)
    view.setUint32(record.offset + 28, 0, false)
    bytes[record.offset + 8] = 4
    bytes[record.offset + 9] = 3
    bytes.fill(2, record.offset + 32, record.offset + 36)
    bytes[record.offset + 32] = point
    bytes[record.offset + 48] = 1
    expect(() => readProfile(bytes)).toThrow(new RegExp(`mAB {2}CLUT grid point count ${point}`))
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
