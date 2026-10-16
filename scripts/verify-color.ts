import type { Dirent, Stats } from 'node:fs'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { buildProofTable, fastProof, fromGray, fromPress, proof, readProfile, toGray, toPress } from '../packages/render/src/color/index.ts'
import { checked, color1, color3, color4 } from '../packages/render/src/color/types.ts'
import * as reference from '../packages/render/test-fixtures/lcms/reference.ts'

const roots = ['/System/Library/ColorSync/Profiles', '/Library/ColorSync/Profiles', `${process.env.HOME}/Library/ColorSync/Profiles`]

const visitedDirectories = new Set<string>()

function discover(candidate: string, explicit: boolean, found: Set<string>): void {
  let stat: Stats
  try {
    stat = statSync(candidate)
  } catch {
    return
  }
  if (stat.isDirectory()) {
    let real: string
    try {
      real = realpathSync(candidate)
    } catch {
      return
    }
    if (visitedDirectories.has(real)) return
    visitedDirectories.add(real)
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
    const profileClass = bytes.toString('ascii', 12, 16),
      colorSpace = bytes.toString('ascii', 16, 20)
    if (explicit || ((profileClass === 'prtr' || profileClass === 'mntr') && (colorSpace === 'CMYK' || colorSpace === 'GRAY')))
      found.add(path.resolve(candidate))
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
const describe = (value: Metrics) => `p99=${Math.max(...value.p99).toFixed(3)} max=${Math.max(...value.maximum).toFixed(3)}`

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
    const gray = profile.colorSpace === 'GRAY'
    const flags = reference.cmsFLAGS_BLACKPOINTCOMPENSATION,
      exact = flags | reference.cmsFLAGS_NOOPTIMIZE | reference.cmsFLAGS_NOCACHE
    const deviceDouble = gray ? reference.TYPE_GRAY_DBL : reference.TYPE_CMYK_DBL,
      device8 = gray ? reference.TYPE_GRAY_8 : reference.TYPE_CMYK_8,
      channels = gray ? 1 : 4
    const forward = lcms.cmsCreateTransform(srgb, reference.TYPE_RGB_DBL | 4, press, deviceDouble | 4, reference.INTENT_RELATIVE_COLORIMETRIC, exact)
    const reverse = lcms.cmsCreateTransform(press, deviceDouble | 4, srgb, reference.TYPE_RGB_DBL | 4, reference.INTENT_RELATIVE_COLORIMETRIC, exact)
    const forward8 = lcms.cmsCreateTransform(srgb, reference.TYPE_RGB_8, press, device8, reference.INTENT_RELATIVE_COLORIMETRIC, flags)
    const reverse8 = lcms.cmsCreateTransform(press, device8, srgb, reference.TYPE_RGB_8, reference.INTENT_RELATIVE_COLORIMETRIC, flags)
    if (!forward || !reverse || !forward8 || !reverse8) throw new Error('LittleCMS refused to create a profile transform')
    transforms.push(forward, reverse, forward8, reverse8)
    const rgb = grid(3, 17),
      device = grid(channels, gray ? 65 : 9)
    const oracleTo = lcms.cmsDoTransform(forward, Float32Array.from(rgb.flat()), rgb.length)
    const oracleFrom = lcms.cmsDoTransform(
      reverse,
      Float32Array.from(device.flat(), (value) => value * (gray ? 1 : 100)),
      device.length,
    )
    const toResult = metrics(
      rgb.map((value) => (gray ? toGray(profile, color3(value, 'RGB grid point')) : toPress(profile, color3(value, 'RGB grid point')))),
      oracleTo,
      channels,
      gray ? 255 : 2.55,
    )
    const fromResult = metrics(
      device.map((value) => (gray ? fromGray(profile, color1(value, 'gray grid point')) : fromPress(profile, color4(value, 'CMYK grid point')))),
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
    const proofResult = metrics(
      sample.map((value) => proof(profile, color3(value, 'RGB sample'))),
      exactProof,
      3,
      255,
    )
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
    const results = { output: passes(toResult), input: passes(fromResult), proof: !gray || passes(proofResult), fastProof: passesFast(oursFast, oracleFast) }
    if (!Object.values(results).every(Boolean)) failed = true
    console.log(
      `${pathname} | ${profile.colorSpace.trim()} v${profile.version} | A2B=${profile.a2b.encoding} B2A=${profile.b2a.encoding} gamut=${profile.gamut?.encoding ?? 'none'} | output=${results.output ? 'PASS' : 'FAIL'} ${describe(toResult)} input=${results.input ? 'PASS' : 'FAIL'} ${describe(fromResult)}${gray ? ` proof=${results.proof ? 'PASS' : 'FAIL'} ${describe(proofResult)}` : ''} fastProof=${results.fastProof ? 'PASS' : 'FAIL'} ${describe(oursFast)}`,
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
