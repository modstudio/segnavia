import { expect, test } from 'bun:test'
import { crc32 } from './crc32.ts'
import type { OutputDate } from './output-date.ts'
import { pngChunk } from './png-chunk.ts'
import { stampImage } from './stamp-image.ts'

const encoder = new TextEncoder()
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function u32(value: number, littleEndian = false): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, littleEndian)
  return bytes
}

function png(): Uint8Array {
  return concat(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('IDAT', new Uint8Array()),
    pngChunk('IEND', new Uint8Array()),
  )
}

function jpeg(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xd9])
}

function webp(): Uint8Array {
  const chunk = concat(encoder.encode('VP8X'), u32(10, true), new Uint8Array(10))
  return concat(encoder.encode('RIFF'), u32(4 + chunk.length, true), encoder.encode('WEBP'), chunk)
}

function pngDate(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  while (offset < bytes.length) {
    const length = view.getUint32(offset)
    const type = text(bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    expect(view.getUint32(offset + 8 + length)).toBe(crc32(bytes.subarray(offset + 4, offset + 8 + length)))
    if (type === 'tEXt') return text(data).split('\0')[1] ?? ''
    offset += length + 12
  }
  throw new Error('No PNG creation date')
}

function jpegXmp(bytes: Uint8Array): string {
  let offset = 2
  while (offset < bytes.length - 1) {
    const marker = bytes[offset + 1]
    if (marker === 0xd9) break
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 2, 2).getUint16(0)
    if (marker === 0xe1) return text(bytes.subarray(offset + 4, offset + 2 + length))
    offset += length + 2
  }
  throw new Error('No JPEG XMP segment')
}

function webpXmp(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(view.getUint32(4, true)).toBe(bytes.length - 8)
  expect((bytes[20] ?? 0) & 0x04).toBe(0x04)
  let offset = 12
  while (offset < bytes.length) {
    const name = text(bytes.subarray(offset, offset + 4))
    const length = view.getUint32(offset + 4, true)
    if (name === 'XMP ') return text(bytes.subarray(offset + 8, offset + 8 + length))
    offset += 8 + length + (length % 2)
  }
  throw new Error('No WebP XMP chunk')
}

test.each([
  [{ kind: 'instant', moment: Date.parse('2026-07-04T16:34:56Z'), zone: 'America/New_York' }, '2026-07-04T12:34:56-04:00'],
  [{ kind: 'date', date: '2026-11-14' }, '2026-11-14'],
] as const)('stamps PNG, JPEG, and extended WebP with %s', (date, expected) => {
  const outputDate = date as OutputDate
  expect(pngDate(stampImage(png(), outputDate))).toBe(expected)
  expect(jpegXmp(stampImage(jpeg(), outputDate))).toContain(`<xmp:CreateDate>${expected}</xmp:CreateDate>`)
  expect(webpXmp(stampImage(webp(), outputDate))).toContain(`<xmp:ModifyDate>${expected}</xmp:ModifyDate>`)
})

test('returns image bytes unchanged when no output date is known', () => {
  for (const bytes of [png(), jpeg(), webp()]) expect(stampImage(bytes)).toBe(bytes)
})
