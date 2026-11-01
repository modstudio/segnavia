const COLLECTION_TAG = 'ttcf'
const MAX_COLLECTION_FACES = 64
const MAX_FACE_TABLES = 64
const CHECKSUM_MAGIC = 0xb1b0afba

export type ExtractedFontFace = { data: Uint8Array; format: 'truetype' | 'opentype' }

interface TableRecord {
  tag: string
  offset: number
  length: number
}

function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0)
}

function malformed(offset: number): never {
  throw new Error(`font collection header is malformed at byte ${offset}`)
}

function collectionView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function requireRange(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > bytes.length - length) malformed(Math.max(0, offset))
}

function collectionOffsets(bytes: Uint8Array): number[] {
  requireRange(bytes, 0, 12)
  if (tagAt(bytes, 0) !== COLLECTION_TAG) malformed(0)
  const view = collectionView(bytes)
  const version = view.getUint32(4)
  if (version !== 0x00010000 && version !== 0x00020000) malformed(4)
  const count = view.getUint32(8)
  if (count > MAX_COLLECTION_FACES) throw new Error(`font collection declares ${count} faces, above the limit ${MAX_COLLECTION_FACES}`)
  requireRange(bytes, 12, count * 4)
  const offsets: number[] = []
  for (let index = 0; index < count; index += 1) offsets.push(view.getUint32(12 + index * 4))
  if (version === 0x00020000) requireRange(bytes, 12 + count * 4, 12)
  return offsets
}

function sfntFormat(bytes: Uint8Array, offset: number): ExtractedFontFace['format'] {
  requireRange(bytes, offset, 4)
  const signature = tagAt(bytes, offset)
  if (signature === 'OTTO') return 'opentype'
  if (signature === '\u0000\u0001\u0000\u0000' || signature === 'true') return 'truetype'
  malformed(offset)
}

function faceTables(bytes: Uint8Array, offset: number): TableRecord[] {
  requireRange(bytes, offset, 12)
  const view = collectionView(bytes)
  const count = view.getUint16(offset + 4)
  if (count > MAX_FACE_TABLES) throw new Error(`font face declares ${count} tables, above the limit ${MAX_FACE_TABLES}`)
  requireRange(bytes, offset + 12, count * 16)
  const tables: TableRecord[] = []
  for (let index = 0; index < count; index += 1) {
    const record = offset + 12 + index * 16
    const table = { tag: tagAt(bytes, record), offset: view.getUint32(record + 8), length: view.getUint32(record + 12) }
    if (table.offset > bytes.length - table.length) throw new Error(`font table ${table.tag} lies outside the font file`)
    tables.push(table)
  }
  return tables
}

function decodeUtf16Be(bytes: Uint8Array): string {
  let value = ''
  for (let index = 0; index + 1 < bytes.length; index += 2) value += String.fromCharCode((bytes[index] ?? 0) * 256 + (bytes[index + 1] ?? 0))
  return value
}

function decodeMacRoman(bytes: Uint8Array): string {
  return new TextDecoder('macintosh').decode(bytes)
}

export function sfntPostScriptNames(bytes: Uint8Array, faceOffset = 0): string[] {
  sfntFormat(bytes, faceOffset)
  const name = faceTables(bytes, faceOffset).find((table) => table.tag === 'name')
  if (!name) return []
  requireRange(bytes, name.offset, Math.max(name.length, 6))
  const view = collectionView(bytes)
  const count = view.getUint16(name.offset + 2)
  const strings = view.getUint16(name.offset + 4)
  if (6 + count * 12 > name.length) throw new Error('font table name lies outside the font file')
  const names: Array<{ platform: number; value: string }> = []
  for (let index = 0; index < count; index += 1) {
    const record = name.offset + 6 + index * 12
    const platform = view.getUint16(record)
    if (view.getUint16(record + 6) !== 6 || (platform !== 1 && platform !== 3)) continue
    const length = view.getUint16(record + 8)
    const relative = view.getUint16(record + 10)
    if (strings + relative > name.length - length) throw new Error('font table name lies outside the font file')
    const encoded = bytes.subarray(name.offset + strings + relative, name.offset + strings + relative + length)
    names.push({ platform, value: platform === 3 ? decodeUtf16Be(encoded) : decodeMacRoman(encoded) })
  }
  const preferred = names.filter((name) => name.platform === 3)
  return [...new Set((preferred.length > 0 ? preferred : names).map((name) => name.value))]
}

export function collectionFaces(bytes: Uint8Array): string[] {
  return collectionOffsets(bytes).flatMap((offset) => sfntPostScriptNames(bytes, offset))
}

function checksum(bytes: Uint8Array, offset = 0, length = bytes.length): number {
  let sum = 0
  for (let index = 0; index < length; index += 4) {
    const word = (((bytes[offset + index] ?? 0) << 24) | ((bytes[offset + index + 1] ?? 0) << 16) | ((bytes[offset + index + 2] ?? 0) << 8) | (bytes[offset + index + 3] ?? 0)) >>> 0
    sum = (sum + word) >>> 0
  }
  return sum
}

function directoryFields(count: number): { searchRange: number; entrySelector: number; rangeShift: number } {
  const power = 2 ** Math.floor(Math.log2(Math.max(1, count)))
  return { searchRange: power * 16, entrySelector: Math.log2(power), rangeShift: count * 16 - power * 16 }
}

function extractAt(bytes: Uint8Array, faceOffset: number): ExtractedFontFace {
  const format = sfntFormat(bytes, faceOffset)
  const tables = faceTables(bytes, faceOffset).filter((table) => table.tag !== 'DSIG')
  const directoryLength = 12 + tables.length * 16
  let total = directoryLength
  for (const table of tables) total += (table.length + 3) & ~3
  const data = new Uint8Array(total)
  const view = new DataView(data.buffer)
  data.set(bytes.subarray(faceOffset, faceOffset + 4), 0)
  view.setUint16(4, tables.length)
  const fields = directoryFields(tables.length)
  view.setUint16(6, fields.searchRange)
  view.setUint16(8, fields.entrySelector)
  view.setUint16(10, fields.rangeShift)
  let outputOffset = directoryLength
  let headOffset: number | undefined
  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index]
    if (!table) continue
    const record = 12 + index * 16
    for (let byte = 0; byte < 4; byte += 1) data[record + byte] = table.tag.charCodeAt(byte)
    data.set(bytes.subarray(table.offset, table.offset + table.length), outputOffset)
    if (table.tag === 'head') {
      if (table.length < 12) throw new Error('font table head lies outside the font file')
      new DataView(data.buffer).setUint32(outputOffset + 8, 0)
      headOffset = outputOffset
    }
    view.setUint32(record + 4, checksum(data, outputOffset, table.length))
    view.setUint32(record + 8, outputOffset)
    view.setUint32(record + 12, table.length)
    outputOffset += (table.length + 3) & ~3
  }
  if (headOffset !== undefined) view.setUint32(headOffset + 8, (CHECKSUM_MAGIC - checksum(data)) >>> 0)
  return { data, format }
}

export function extractFace(bytes: Uint8Array, postscriptName: string): ExtractedFontFace {
  const offsets = collectionOffsets(bytes)
  for (const offset of offsets) {
    if (sfntPostScriptNames(bytes, offset).includes(postscriptName)) return extractAt(bytes, offset)
  }
  throw new Error(`font collection has no face named ${postscriptName}; it holds ${collectionFaces(bytes).join(', ')}`)
}
