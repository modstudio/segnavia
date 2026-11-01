import { describe, expect, test } from 'bun:test'
import { collectionFaces, extractFace } from './font-collection.ts'

const align = (value: number) => (value + 3) & ~3

function nameTable(name: string, platform: 1 | 3): Uint8Array {
  const encoded = platform === 3 ? Uint8Array.from([...name].flatMap((character) => [0, character.charCodeAt(0)])) : new TextEncoder().encode(name)
  const data = new Uint8Array(18 + encoded.length)
  const view = new DataView(data.buffer)
  view.setUint16(2, 1)
  view.setUint16(4, 18)
  view.setUint16(6, platform)
  view.setUint16(8, platform === 3 ? 1 : 0)
  view.setUint16(10, platform === 3 ? 0x409 : 0)
  view.setUint16(12, 6)
  view.setUint16(14, encoded.length)
  data.set(encoded, 18)
  return data
}

function fixture(): { collection: Uint8Array; sources: Map<string, Uint8Array> } {
  const faces = [
    { name: 'Fixture-Regular', platform: 3 as const, marker: 11 },
    { name: 'Fixture-Italic', platform: 1 as const, marker: 22 },
  ]
  const tableSets = faces.map((face) => [
    { tag: 'cmap', data: Uint8Array.of(0, 0, 0, 0) },
    { tag: 'head', data: new Uint8Array(54) },
    { tag: 'name', data: nameTable(face.name, face.platform) },
    { tag: 'test', data: Uint8Array.of(face.marker) },
  ])
  const sources = new Map(faces.map((face, index) => [face.name, standalone(tableSets[index] ?? [])]))
  const header = 12 + faces.length * 4
  const directoryOffsets: number[] = []
  let cursor = header
  for (const tables of tableSets) {
    directoryOffsets.push(cursor)
    cursor += 12 + tables.length * 16
  }
  const sharedCmapOffset = cursor
  cursor += 4
  const tableOffsets = tableSets.map((tables) => tables.map((table) => {
    if (table.tag === 'cmap') return sharedCmapOffset
    const offset = cursor
    cursor += align(table.data.length)
    return offset
  }))
  const bytes = new Uint8Array(cursor)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('ttcf'))
  view.setUint32(4, 0x00010000)
  view.setUint32(8, faces.length)
  directoryOffsets.forEach((offset, index) => view.setUint32(12 + index * 4, offset))
  bytes.set(Uint8Array.of(0, 0, 0, 0), sharedCmapOffset)
  tableSets.forEach((tables, faceIndex) => {
    const directory = directoryOffsets[faceIndex] ?? 0
    view.setUint32(directory, 0x00010000)
    view.setUint16(directory + 4, tables.length)
    tables.forEach((table, index) => {
      const record = directory + 12 + index * 16
      bytes.set(new TextEncoder().encode(table.tag), record)
      const offset = tableOffsets[faceIndex]?.[index] ?? 0
      view.setUint32(record + 8, offset)
      view.setUint32(record + 12, table.data.length)
      bytes.set(table.data, offset)
    })
  })
  return { collection: bytes, sources }
}

function standalone(tables: Array<{ tag: string; data: Uint8Array }>): Uint8Array {
  const directory = 12 + tables.length * 16
  const total = tables.reduce((size, table) => size + align(table.data.length), directory)
  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x00010000)
  view.setUint16(4, tables.length)
  view.setUint16(6, 64)
  view.setUint16(8, 2)
  let offset = directory
  tables.forEach((table, index) => {
    const record = 12 + index * 16
    bytes.set(new TextEncoder().encode(table.tag), record)
    bytes.set(table.data, offset)
    view.setUint32(record + 4, tableChecksum(bytes, offset, table.data.length))
    view.setUint32(record + 8, offset)
    view.setUint32(record + 12, table.data.length)
    offset += align(table.data.length)
  })
  const head = tables.findIndex((table) => table.tag === 'head')
  if (head >= 0) {
    const headOffset = view.getUint32(12 + head * 16 + 8)
    view.setUint32(headOffset + 8, (0xb1b0afba - tableChecksum(bytes, 0, bytes.length)) >>> 0)
  }
  return bytes
}

function tableChecksum(bytes: Uint8Array, offset: number, length: number): number {
  let sum = 0
  for (let index = 0; index < length; index += 4) {
    const word = (((bytes[offset + index] ?? 0) << 24) | ((bytes[offset + index + 1] ?? 0) << 16) | ((bytes[offset + index + 2] ?? 0) << 8) | (bytes[offset + index + 3] ?? 0)) >>> 0
    sum = (sum + word) >>> 0
  }
  return sum
}

function zeroAdjustment(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice()
  const view = new DataView(copy.buffer)
  const count = view.getUint16(4)
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16
    if (new TextDecoder().decode(copy.subarray(record, record + 4)) === 'head') view.setUint32(view.getUint32(record + 8) + 8, 0)
  }
  return copy
}

describe('font collections', () => {
  test('lists UTF-16BE and Mac Roman names and extracts either shared-table face', () => {
    const built = fixture()
    expect(collectionFaces(built.collection)).toEqual(['Fixture-Regular', 'Fixture-Italic'])
    for (const [name, source] of built.sources) {
      const extracted = extractFace(built.collection, name)
      expect(extracted.format).toBe('truetype')
      expect(zeroAdjustment(extracted.data)).toEqual(zeroAdjustment(source))
      expect(new DataView(extracted.data.buffer).getUint32(12 + 2 * 16 + 4)).not.toBe(0)
    }
  })

  test('refuses an unknown face and malformed or excessive collections', () => {
    const { collection } = fixture()
    expect(() => extractFace(collection, 'Missing')).toThrow('font collection has no face named Missing; it holds Fixture-Regular, Fixture-Italic')
    expect(() => collectionFaces(collection.subarray(0, 10))).toThrow('font collection header is malformed at byte 0')
    const excessive = collection.slice(0, 12)
    new DataView(excessive.buffer).setUint32(8, 65)
    expect(() => collectionFaces(excessive)).toThrow('font collection declares 65 faces, above the limit 64')
  })

  test('refuses a table outside the file', () => {
    const { collection } = fixture()
    const broken = collection.slice()
    const first = new DataView(broken.buffer).getUint32(12)
    new DataView(broken.buffer).setUint32(first + 12 + 8, broken.length)
    expect(() => collectionFaces(broken)).toThrow('font table cmap lies outside the font file')
  })
})
