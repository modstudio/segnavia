import { destinationBlackPoint, detectSourceBlackPoint } from './black-point.ts'
import { fixed, matrixTables, parseMab, parseMft, signature, u32 } from './tables.ts'
import { type ColorTable, checked, type Profile, REVERSE_LUT, refuse } from './types.ts'

type Records = Record<string, { offset: number; size: number; type: string }>

function header(bytes: Uint8Array): Pick<Profile, 'majorVersion' | 'profileClass' | 'colorSpace' | 'pcs'> {
  if (bytes.length < 132) refuse(`profile length ${bytes.length}`, 'an ICC profile with a complete 128-byte header and tag table')
  if (signature(bytes, 36) !== 'acsp') refuse(`header signature ${JSON.stringify(signature(bytes, 36))}`, '"acsp"')
  const major = checked(bytes, 8, 'ICC header'),
    minor = checked(bytes, 9, 'ICC header')
  if (major !== 2 && major !== 4) refuse(`ICC version ${major}.${minor >> 4}`, 'ICC version 2 or 4')
  const profileClass = signature(bytes, 12)
  if (profileClass !== 'prtr' && profileClass !== 'mntr') refuse(`profile class ${JSON.stringify(profileClass)}`, 'prtr or mntr')
  const colorSpace = signature(bytes, 16)
  if (colorSpace !== 'CMYK' && colorSpace !== 'RGB ') refuse(`color space ${JSON.stringify(colorSpace)}`, 'CMYK or RGB')
  const pcs = signature(bytes, 20)
  if (pcs !== 'Lab ' && pcs !== 'XYZ ') refuse(`PCS ${JSON.stringify(pcs)}`, 'Lab or XYZ')
  return { majorVersion: major, profileClass, colorSpace, pcs }
}

function records(bytes: Uint8Array, view: DataView): Records {
  const count = u32(view, 128)
  if (count > (bytes.length - 132) / 12) refuse('truncated tag table', 'tag records contained within the profile')
  const result: Records = {}
  for (let index = 0; index < count; index++) {
    const at = 132 + index * 12
    const name = signature(bytes, at),
      offset = u32(view, at + 4),
      size = u32(view, at + 8)
    if (offset > bytes.length - 8 || size > bytes.length - offset) refuse(`truncated ${name} tag`, 'tag data contained within the profile')
    result[name] = { offset, size, type: signature(bytes, offset) }
  }
  return result
}

function table(bytes: Uint8Array, view: DataView, all: Records, names: string[], inputs: number, outputs: number): ColorTable {
  const name = names.find((candidate) => all[candidate])
  if (!name) refuse(`missing ${names.join('/')} tag`, names.join(' or '))
  const record = all[name]
  if (!record) throw new Error(`ICC profile is missing ${name} after its tag set was validated`)
  let result: ColorTable
  if (record.type === 'mft1' || record.type === 'mft2') result = parseMft(bytes, view, record.offset, record.type)
  else if (record.type === 'mAB ' || record.type === REVERSE_LUT) result = parseMab(bytes, view, record.offset, record.type)
  else return refuse(`${name} tag type ${JSON.stringify(record.type)}`, `mft1, mft2, mAB , or ${REVERSE_LUT}`)
  if (result.inputChannels !== inputs || result.outputChannels !== outputs)
    refuse(`${name} channel count ${result.inputChannels}->${result.outputChannels}`, `${inputs}->${outputs}`)
  return result
}

export function readProfile(bytes: Uint8Array): Profile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parsed = header(bytes),
    all = records(bytes, view)
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
    if (gamutRecord.type === 'mft1' || gamutRecord.type === 'mft2') gamut = parseMft(bytes, view, gamutRecord.offset, gamutRecord.type)
    else if (gamutRecord.type === 'mAB ' || gamutRecord.type === REVERSE_LUT) gamut = parseMab(bytes, view, gamutRecord.offset, gamutRecord.type)
    else refuse(`gamt tag type ${JSON.stringify(gamutRecord.type)}`, `mft1, mft2, mAB , or ${REVERSE_LUT}`)
  }
  const whitePointRecord = all.wtpt
  if (!whitePointRecord) throw new Error('ICC profile is missing wtpt after its tag set was validated')
  const whitePoint: [number, number, number] = [
    fixed(view, whitePointRecord.offset + 8),
    fixed(view, whitePointRecord.offset + 12),
    fixed(view, whitePointRecord.offset + 16),
  ]
  const sourceBlackPoint = detectSourceBlackPoint(parsed.colorSpace, parsed.pcs, parsed.majorVersion, a2b, perceptualB2a)
  const detectedDestination = destinationBlackPoint(parsed.colorSpace, parsed.pcs, parsed.majorVersion, a2b, b2a, sourceBlackPoint)
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
    destinationBlackPoint: detectedDestination,
  }
}
