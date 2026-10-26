import { inflateSync } from 'node:zlib'

export interface PngPixels {
  width: number
  height: number
  pixels: Uint8Array
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function paeth(left: number, up: number, upperLeft: number): number {
  const prediction = left + up - upperLeft
  const leftDistance = Math.abs(prediction - left)
  const upDistance = Math.abs(prediction - up)
  const upperLeftDistance = Math.abs(prediction - upperLeft)
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left
  return upDistance <= upperLeftDistance ? up : upperLeft
}

function prediction(filter: number, left: number, up: number, upperLeft: number, row: number): number {
  switch (filter) {
    case 0:
      return 0
    case 1:
      return left
    case 2:
      return up
    case 3:
      return Math.floor((left + up) / 2)
    case 4:
      return paeth(left, up, upperLeft)
    default:
      throw new Error(`Unsupported PNG scanline filter: found ${filter} on row ${row}.`)
  }
}

interface Header {
  width: number
  height: number
  channels: 3 | 4
}

function readHeader(data: Uint8Array): Header {
  if (data.length !== 13) throw new Error(`Unsupported PNG IHDR: found ${data.length} bytes, expected 13.`)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = view.getUint32(0)
  const height = view.getUint32(4)
  const bitDepth = data[8]
  const colorType = data[9]
  const compression = data[10]
  const filter = data[11]
  const interlace = data[12]
  if (width === 0 || height === 0) throw new Error(`Unsupported PNG dimensions: found ${width}x${height}.`)
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: found ${bitDepth}, expected 8.`)
  if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported PNG colour type: found ${colorType}, expected 2 (RGB) or 6 (RGBA).`)
  if (compression !== 0) throw new Error(`Unsupported PNG compression method: found ${compression}.`)
  if (filter !== 0) throw new Error(`Unsupported PNG filter method: found ${filter}.`)
  if (interlace !== 0) throw new Error(`Unsupported PNG interlace method: found ${interlace}, expected 0.`)
  return { width, height, channels: colorType === 2 ? 3 : 4 }
}

function readChunks(bytes: Uint8Array): { header: Header; compressed: Uint8Array } {
  if (!bytesEqual(bytes.subarray(0, SIGNATURE.length), SIGNATURE)) throw new Error('Unsupported PNG signature: found invalid or missing signature.')

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = SIGNATURE.length
  let header: Header | undefined
  const idat: Uint8Array[] = []
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(`Invalid PNG chunk at byte ${offset}: found a truncated header.`)
    const length = view.getUint32(offset)
    const end = offset + 12 + length
    if (end > bytes.length) throw new Error(`Invalid PNG chunk at byte ${offset}: found length ${length} beyond the input.`)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      if (header) throw new Error('Unsupported PNG: found more than one IHDR chunk.')
      header = readHeader(data)
    } else if (type === 'IDAT') {
      idat.push(data)
    }
    offset = end
    if (type === 'IEND') break
  }
  if (!header) throw new Error('Unsupported PNG: found no IHDR chunk.')
  if (idat.length === 0) throw new Error('Unsupported PNG: found no IDAT chunk.')

  const compressedLength = idat.reduce((sum, chunk) => sum + chunk.length, 0)
  const compressed = new Uint8Array(compressedLength)
  let compressedOffset = 0
  for (const chunk of idat) {
    compressed.set(chunk, compressedOffset)
    compressedOffset += chunk.length
  }
  return { header, compressed }
}

function restoreScanlines(inflated: Uint8Array, header: Header): Uint8Array {
  const { width, height, channels } = header
  const stride = width * channels
  const expectedLength = height * (stride + 1)
  if (inflated.length !== expectedLength) throw new Error(`Invalid PNG pixels: found ${inflated.length} inflated bytes, expected ${expectedLength}.`)

  const restored = new Uint8Array(width * height * channels)
  let source = 0
  for (let y = 0; y < height; y++) {
    const filter = inflated[source++]
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const raw = inflated[source++] ?? 0
      const left = x >= channels ? (restored[row + x - channels] ?? 0) : 0
      const up = y > 0 ? (restored[row - stride + x] ?? 0) : 0
      const upperLeft = y > 0 && x >= channels ? (restored[row - stride + x - channels] ?? 0) : 0
      restored[row + x] = (raw + prediction(filter ?? -1, left, up, upperLeft, y)) & 0xff
    }
  }
  return restored
}

function rgbPixels(restored: Uint8Array, channels: 3 | 4): Uint8Array {
  if (channels === 3) return restored
  const pixels = new Uint8Array((restored.length / 4) * 3)
  for (let source = 0, target = 0; source < restored.length; source += 4, target += 3) {
    const alpha = restored[source + 3]
    if (alpha !== 255) throw new Error(`Unsupported PNG alpha: found ${alpha} at pixel ${source / 4}, expected fully opaque pixels.`)
    pixels.set(restored.subarray(source, source + 3), target)
  }
  return pixels
}

export function decodePng(bytes: Uint8Array): PngPixels {
  const { header, compressed } = readChunks(bytes)
  const restored = restoreScanlines(inflateSync(compressed), header)
  return { width: header.width, height: header.height, pixels: rgbPixels(restored, header.channels) }
}
