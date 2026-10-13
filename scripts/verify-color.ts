import type { Dirent, Stats } from 'node:fs'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as reference from 'lcms-wasm'
import { buildProofTable, fastProof, fromPress, readProfile, toPress } from '../packages/render/src/color/index.ts'
import { checked, color3, color4 } from '../packages/render/src/color/types.ts'

const roots = [
  '/System/Library/ColorSync/Profiles',
  '/Library/ColorSync/Profiles',
  `${process.env.HOME}/Library/ColorSync/Profiles`,
  '/Library/Application Support/Adobe/Color/Profiles',
  '/Applications',
]

function discover(candidate: string, explicit: boolean, found: Set<string>): void {
  let stat: Stats
  try {
    stat = lstatSync(candidate)
  } catch {
    return
  }
  if (stat.isSymbolicLink()) return
  if (stat.isDirectory()) {
    let entries: Dirent[]
    try {
      entries = readdirSync(candidate, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) discover(path.join(candidate, entry.name), false, found)
    return
  }
  if (!explicit && !/\.(icc|icm)$/i.test(candidate)) return
  try {
    const bytes = readFileSync(candidate)
    if (explicit || (bytes.toString('ascii', 12, 16) === 'prtr' && bytes.toString('ascii', 16, 20) === 'CMYK')) found.add(path.resolve(candidate))
  } catch {}
}

function grid(dimensions: number, divisions: number, maximum = 1): number[][] {
  const result: number[][] = []
  const visit = (values: number[]): void => {
    if (values.length === dimensions) result.push(values)
    else for (let index = 0; index < divisions; index++) visit([...values, (index * maximum) / (divisions - 1)])
  }
  visit([])
  return result
}

interface Metrics {
  maximum: number[]
  p99: number[]
}
function metrics(ours: readonly (readonly number[])[], oracle: ArrayLike<number>, channels: number, scale: number): Metrics {
  const differences = Array.from({ length: channels }, (_, channel) =>
    ours
      .map((values, index) =>
        Math.abs(checked(values, channel, 'engine result') * 255 - checked(oracle, index * channels + channel, 'LittleCMS result') * scale),
      )
      .sort((a, b) => a - b),
  )
  return { maximum: differences.map((values) => values.at(-1) ?? 0), p99: differences.map((values) => values[Math.ceil(values.length * 0.99) - 1] ?? 0) }
}

const passes = (value: Metrics) => value.maximum.every((maximum) => maximum <= 3) && value.p99.every((p99) => p99 <= 1)
const passesFast = (value: Metrics, oracle: Metrics) =>
  value.maximum.every((maximum, index) => maximum <= checked(oracle.maximum, index, 'oracle maximums') + 0.5) &&
  value.p99.every((p99, index) => p99 <= checked(oracle.p99, index, 'oracle percentiles') + 0.5)

const lcms = await reference.instantiate()
const found = new Set<string>()
const args = process.argv.slice(2)
for (const candidate of args.length ? args : roots) discover(candidate, args.length > 0, found)
const srgb = lcms.cmsCreate_sRGBProfile()
let failed = false
for (const pathname of [...found].sort()) {
  const transforms: number[] = []
  let press = 0
  try {
    const bytes = new Uint8Array(readFileSync(pathname)),
      profile = readProfile(bytes)
    press = lcms.cmsOpenProfileFromMem(bytes, bytes.length)
    if (!press) throw new Error('LittleCMS refused to open the profile')
    const flags = reference.cmsFLAGS_BLACKPOINTCOMPENSATION,
      exact = flags | reference.cmsFLAGS_NOOPTIMIZE | reference.cmsFLAGS_NOCACHE
    const forward = lcms.cmsCreateTransform(srgb, reference.TYPE_RGB_DBL | 4, press, reference.TYPE_CMYK_DBL | 4, reference.INTENT_RELATIVE_COLORIMETRIC, exact)
    const reverse = lcms.cmsCreateTransform(press, reference.TYPE_CMYK_DBL | 4, srgb, reference.TYPE_RGB_DBL | 4, reference.INTENT_RELATIVE_COLORIMETRIC, exact)
    const forward8 = lcms.cmsCreateTransform(srgb, reference.TYPE_RGB_8, press, reference.TYPE_CMYK_8, reference.INTENT_RELATIVE_COLORIMETRIC, flags)
    const reverse8 = lcms.cmsCreateTransform(press, reference.TYPE_CMYK_8, srgb, reference.TYPE_RGB_8, reference.INTENT_RELATIVE_COLORIMETRIC, flags)
    transforms.push(forward, reverse, forward8, reverse8)
    const rgb = grid(3, 17),
      cmyk = grid(4, 9)
    const oracleTo = lcms.cmsDoTransform(forward, Float32Array.from(rgb.flat()), rgb.length)
    const oracleFrom = lcms.cmsDoTransform(
      reverse,
      Float32Array.from(cmyk.flat(), (value) => value * 100),
      cmyk.length,
    )
    const toResult = metrics(
      rgb.map((value) => toPress(profile, color3(value, 'RGB grid point'))),
      oracleTo,
      4,
      2.55,
    )
    const fromResult = metrics(
      cmyk.map((value) => fromPress(profile, color4(value, 'CMYK grid point'))),
      Float32Array.from(oracleFrom, (value) => Math.max(0, Math.min(1, value))),
      3,
      255,
    )
    let seed = 0x5e6e61
    const sample = Array.from({ length: 10_000 }, () =>
      Array.from({ length: 3 }, () => {
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        return (seed >>> 0) / 4_294_967_295
      }),
    )
    const exactCmyk = lcms.cmsDoTransform(forward, Float32Array.from(sample.flat()), sample.length)
    const exactProof = lcms.cmsDoTransform(reverse, exactCmyk, sample.length)
    const bytesIn = Uint8Array.from(sample.flat(), (value) => Math.round(value * 255))
    const byteProof = lcms.cmsDoTransform(reverse8, lcms.cmsDoTransform(forward8, bytesIn, sample.length), sample.length)
    const oracleFast = metrics(
      Array.from({ length: sample.length }, (_, index) => Array.from(byteProof.slice(index * 3, index * 3 + 3), (value) => value / 255)),
      exactProof,
      3,
      255,
    )
    const table = buildProofTable(profile)
    const oursFast = metrics(
      sample.map((value) => fastProof(table, color3(value, 'RGB sample'))),
      exactProof,
      3,
      255,
    )
    const results = { toPress: passes(toResult), fromPress: passes(fromResult), fastProof: passesFast(oursFast, oracleFast) }
    if (!Object.values(results).every(Boolean)) failed = true
    console.log(
      `${pathname} | v${profile.version} | A2B=${profile.a2b.encoding} B2A=${profile.b2a.encoding} gamut=${profile.gamut?.encoding ?? 'none'} | toPress=${results.toPress ? 'PASS' : 'FAIL'} fromPress=${results.fromPress ? 'PASS' : 'FAIL'} fastProof=${results.fastProof ? 'PASS' : 'FAIL'}`,
    )
  } catch (error) {
    failed = true
    console.log(`${pathname} | REFUSED: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    for (const transform of transforms) if (transform) lcms.cmsDeleteTransform(transform)
    if (press) lcms.cmsCloseProfile(press)
  }
}
lcms.cmsCloseProfile(srgb)
if (failed) process.exitCode = 1
