import { describe, expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { decodePng } from './png-pixels.ts'

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 12)
  const view = new DataView(result.buffer)
  view.setUint32(0, data.length)
  const typeBytes = new TextEncoder().encode(type)
  result.set(typeBytes, 4)
  result.set(data, 8)
  const checksum = new Uint8Array(typeBytes.length + data.length)
  checksum.set(typeBytes)
  checksum.set(data, typeBytes.length)
  view.setUint32(result.length - 4, crc32(checksum))
  return result
}

function paeth(left: number, up: number, upperLeft: number): number {
  const sum = left + up - upperLeft
  const distances = [Math.abs(sum - left), Math.abs(sum - up), Math.abs(sum - upperLeft)]
  const closest = Math.min(...distances)
  return distances[0] === closest ? left : distances[1] === closest ? up : upperLeft
}

function predictor(filter: number, left: number, up: number, upperLeft: number): number {
  const predictions = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)]
  return predictions[filter] ?? 0
}

function filteredRow(row: Uint8Array, previous: Uint8Array | undefined, channels: number, filter: number): Uint8Array {
  const result = new Uint8Array(row.length + 1)
  result[0] = filter
  for (let x = 0; x < row.length; x++) {
    const left = x >= channels ? (row[x - channels] ?? 0) : 0
    const up = previous?.[x] ?? 0
    const upperLeft = x >= channels ? (previous?.[x - channels] ?? 0) : 0
    result[x + 1] = ((row[x] ?? 0) - predictor(filter, left, up, upperLeft)) & 0xff
  }
  return result
}

function png(width: number, rows: Uint8Array[], colorType: 2 | 6, filters: number[], bitDepth = 8): Uint8Array {
  const channels = colorType === 2 ? 3 : 4
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, rows.length)
  ihdr[8] = bitDepth
  ihdr[9] = colorType
  const scanlines = rows.map((row, index) => filteredRow(row, rows[index - 1], channels, filters[index] ?? 0))
  const raw = new Uint8Array(scanlines.reduce((sum, row) => sum + row.length, 0))
  let offset = 0
  for (const row of scanlines) {
    raw.set(row, offset)
    offset += row.length
  }
  const compressed = deflateSync(raw)
  const split = Math.floor(compressed.length / 2)
  const parts = [
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed.subarray(0, split)),
    chunk('IDAT', compressed.subarray(split)),
    chunk('IEND', new Uint8Array()),
  ]
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

describe('PNG pixels', () => {
  test('undoes every scanline filter for 8-bit RGB pixels', () => {
    const rows = [
      Uint8Array.from([10, 20, 30, 40, 50, 60]),
      Uint8Array.from([15, 25, 35, 75, 85, 95]),
      Uint8Array.from([20, 30, 40, 80, 90, 100]),
      Uint8Array.from([25, 35, 45, 85, 95, 105]),
      Uint8Array.from([30, 40, 50, 90, 100, 110]),
    ]
    const decoded = decodePng(png(2, rows, 2, [0, 1, 2, 3, 4]))
    expect(decoded).toEqual({ width: 2, height: 5, pixels: Uint8Array.from(rows.flatMap((row) => [...row])) })
  })

  test('drops the alpha channel from fully opaque RGBA pixels', () => {
    const decoded = decodePng(png(2, [Uint8Array.from([1, 2, 3, 255, 4, 5, 6, 255])], 6, [4]))
    expect(decoded).toEqual({ width: 2, height: 1, pixels: Uint8Array.from([1, 2, 3, 4, 5, 6]) })
  })

  test('refuses unsupported formats and non-opaque pixels', () => {
    expect(() => decodePng(png(1, [Uint8Array.from([1, 2, 3])], 2, [0], 16))).toThrow('found 16, expected 8')
    expect(() => decodePng(png(1, [Uint8Array.from([1, 2, 3, 254])], 6, [0]))).toThrow('found 254 at pixel 0')
  })
})
