import { deflateSync } from 'node:zlib'

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(name: string, data: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(name)
  const output = new Uint8Array(data.length + 12)
  const view = new DataView(output.buffer)
  view.setUint32(0, data.length)
  output.set(type, 4)
  output.set(data, 8)
  view.setUint32(output.length - 4, crc32(output.subarray(4, output.length - 4)))
  return output
}

export function rgbPng(rgb: Uint8Array, width: number, height: number, profile?: Uint8Array): Uint8Array {
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = new Uint8Array(rgb.length + height)
  const rowBytes = width * 3
  for (let row = 0; row < height; row++) rows.set(rgb.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1)
  let color: Uint8Array
  if (profile) {
    const name = new TextEncoder().encode('PDF profile')
    const compressed = deflateSync(profile)
    const contents = new Uint8Array(name.length + 2 + compressed.length)
    contents.set(name)
    contents.set(compressed, name.length + 2)
    color = chunk('iCCP', contents)
  } else color = chunk('sRGB', Uint8Array.of(0))
  const parts = [signature, chunk('IHDR', header), color, chunk('IDAT', deflateSync(rows)), chunk('IEND', new Uint8Array())]
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    output.set(part, at)
    at += part.length
  }
  return output
}
