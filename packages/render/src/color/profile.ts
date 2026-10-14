import { fixed, need, signature, type TagBounds, u32 } from './binary.ts'
import { destinationBlackPoint, detectSourceBlackPoint } from './black-point.ts'
import { matrixTables, parseMab, parseMft, type TagRecord } from './tables.ts'
import { type ColorTable, checked, type Profile, REVERSE_LUT, refuse } from './types.ts'

// Every parsed table is backed by the profile bytes, so this ceiling also bounds table memory.
export const MAX_PROFILE_BYTES = 32 * 1024 * 1024

type Records = Record<string, TagRecord>

function header(bytes: Uint8Array, view: DataView, bounds: TagBounds): Pick<Profile, 'majorVersion' | 'profileClass' | 'colorSpace' | 'pcs'> {
  need(0, 132, bounds)
  if (signature(bytes, 36, bounds) !== 'acsp') refuse(`header signature ${JSON.stringify(signature(bytes, 36, bounds))}`, '"acsp"')
  const major = checked(bytes, 8, 'ICC header'),
    minor = checked(bytes, 9, 'ICC header')
  if (major !== 2 && major !== 4) refuse(`ICC version ${major}.${minor >> 4}`, 'ICC version 2 or 4')
  const profileClass = signature(bytes, 12, bounds)
  if (profileClass !== 'prtr' && profileClass !== 'mntr') refuse(`profile class ${JSON.stringify(profileClass)}`, 'prtr or mntr')
  const colorSpace = signature(bytes, 16, bounds)
  if (colorSpace !== 'CMYK' && colorSpace !== 'RGB ') refuse(`color space ${JSON.stringify(colorSpace)}`, 'CMYK or RGB')
  const pcs = signature(bytes, 20, bounds)
  if (pcs !== 'Lab ' && pcs !== 'XYZ ') refuse(`PCS ${JSON.stringify(pcs)}`, 'Lab or XYZ')
  u32(view, 0, bounds)
  return { majorVersion: major, profileClass, colorSpace, pcs }
}

function records(bytes: Uint8Array, view: DataView, bounds: TagBounds): Records {
  const count = u32(view, 128, bounds)
  if (count > (bytes.length - 132) / 12) refuse('truncated tag table', 'tag records contained within the profile')
  const result: Records = {}
  for (let index = 0; index < count; index++) {
    const at = 132 + index * 12,
      name = signature(bytes, at, bounds),
      offset = u32(view, at + 4, bounds),
      size = u32(view, at + 8, bounds)
    if (offset > bytes.length - 8 || size > bytes.length - offset) refuse(`truncated ${name} tag`, 'tag data contained within the profile')
    const record = { offset, size, end: offset + size, name, type: '' }
    record.type = signature(bytes, offset, record)
    result[name] = record
  }
  return result
}

function table(bytes: Uint8Array, view: DataView, all: Records, names: string[], inputs: number, outputs: number): ColorTable {
  const name = names.find((candidate) => all[candidate])
  if (!name) refuse(`missing ${names.join('/')} tag`, names.join(' or '))
  const record = all[name]
  if (!record) throw new Error(`ICC profile is missing ${name} after its tag set was validated`)
  if (record.type === 'mft1' || record.type === 'mft2') return parseMft(bytes, view, record, record.type, inputs, outputs)
  if (record.type === 'mAB ' || record.type === REVERSE_LUT) return parseMab(bytes, view, record, record.type, inputs, outputs)
  return refuse(`${name} tag type ${JSON.stringify(record.type)}`, `mft1, mft2, mAB , or ${REVERSE_LUT}`)
}

export function readProfile(bytes: Uint8Array): Profile {
  if (bytes.length > MAX_PROFILE_BYTES) refuse(`profile length ${bytes.length}`, `at most ${MAX_PROFILE_BYTES} bytes`)
  const bounds = { end: bytes.length, name: 'profile' },
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parsed = header(bytes, view, bounds),
    all = records(bytes, view, bounds)
  if (all.wtpt?.type !== 'XYZ ') refuse(`white point tag type ${JSON.stringify(all.wtpt?.type ?? 'missing')}`, 'XYZ ')
  const channels = parsed.colorSpace === 'CMYK' ? 4 : 3
  const matrix = parsed.colorSpace === 'RGB ' ? matrixTables(bytes, view, all) : undefined
  const a2b = matrix?.a2b ?? table(bytes, view, all, ['A2B1', 'A2B0'], channels, 3)
  const b2a = matrix?.b2a ?? table(bytes, view, all, ['B2A1', 'B2A0'], 3, channels)
  const perceptualA2b = matrix?.a2b ?? table(bytes, view, all, ['A2B0', 'A2B1'], channels, 3)
  const perceptualB2a = matrix?.b2a ?? table(bytes, view, all, ['B2A0', 'B2A1'], 3, channels)
  const gamutRecord = all.gamt
  let gamut: ColorTable | undefined
  if (gamutRecord) {
    if (gamutRecord.type === 'mft1' || gamutRecord.type === 'mft2') gamut = parseMft(bytes, view, gamutRecord, gamutRecord.type, 3, 1)
    else if (gamutRecord.type === 'mAB ' || gamutRecord.type === REVERSE_LUT) gamut = parseMab(bytes, view, gamutRecord, gamutRecord.type, 3, 1)
    else refuse(`gamt tag type ${JSON.stringify(gamutRecord.type)}`, `mft1, mft2, mAB , or ${REVERSE_LUT}`)
  }
  const white = all.wtpt
  if (!white) throw new Error('ICC profile is missing wtpt after its tag set was validated')
  need(white.offset, 20, white)
  const whitePoint: [number, number, number] = [
    fixed(view, white.offset + 8, white),
    fixed(view, white.offset + 12, white),
    fixed(view, white.offset + 16, white),
  ]
  const sourceBlackPoint = detectSourceBlackPoint(parsed.colorSpace, parsed.pcs, parsed.majorVersion, a2b, perceptualB2a)
  const destination = destinationBlackPoint(parsed.colorSpace, parsed.pcs, parsed.majorVersion, a2b, b2a, sourceBlackPoint)
  return {
    ...parsed,
    version: `${parsed.majorVersion}.${checked(bytes, 9, 'ICC header') >> 4}.${checked(bytes, 9, 'ICC header') & 15}`,
    whitePoint,
    tags: Object.fromEntries(Object.entries(all).map(([name, record]) => [name, record.type])),
    a2b,
    b2a,
    perceptualA2b,
    perceptualB2a,
    gamut,
    sourceBlackPoint,
    destinationBlackPoint: destination,
  }
}
