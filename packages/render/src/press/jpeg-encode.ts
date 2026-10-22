import { forwardDct, quantizeZigzag } from './jpeg-dct.ts'
import { AC_LUM_BITS, AC_LUM_VALUES, DC_LUM_BITS, DC_LUM_VALUES, type HuffmanCode, huffmanCodes, scaleLuminanceQuant, ZIGZAG } from './jpeg-tables.ts'

interface Scan {
  bytes: number[]
  current: number
  filled: number
}

function writeRaw(bytes: number[], data: ArrayLike<number>): void {
  for (let index = 0; index < data.length; index++) bytes.push(data[index] ?? 0)
}

function writeU16(bytes: number[], value: number): void {
  bytes.push((value >> 8) & 255, value & 255)
}

function writeBits(scan: Scan, value: number, count: number): void {
  for (let bit = count - 1; bit >= 0; bit--) {
    scan.current = (scan.current << 1) | ((value >> bit) & 1)
    scan.filled++
    if (scan.filled < 8) continue
    scan.bytes.push(scan.current)
    if (scan.current === 0xff) scan.bytes.push(0)
    scan.current = 0
    scan.filled = 0
  }
}

function padScan(scan: Scan): void {
  if (scan.filled === 0) return
  writeBits(scan, (1 << (8 - scan.filled)) - 1, 8 - scan.filled)
}

function bitCategory(value: number): number {
  let magnitude = Math.abs(value)
  let category = 0
  while (magnitude > 0) {
    magnitude >>= 1
    category++
  }
  return category
}

function extraBits(value: number, category: number): number {
  return value < 0 ? value + (1 << category) - 1 : value
}

function writeCoded(scan: Scan, table: HuffmanCode[], symbol: number, value: number, category: number): void {
  const entry = table[symbol] ?? { code: 0, length: 0 }
  writeBits(scan, entry.code, entry.length)
  if (category > 0) writeBits(scan, extraBits(value, category), category)
}

function writeBlock(scan: Scan, dcTable: HuffmanCode[], acTable: HuffmanCode[], coeffs: Int32Array, previousDc: number): number {
  const dc = coeffs[0] ?? 0
  const diff = dc - previousDc
  const dcCategory = bitCategory(diff)
  writeCoded(scan, dcTable, dcCategory, diff, dcCategory)
  let run = 0
  for (let index = 1; index < 64; index++) {
    const value = coeffs[index] ?? 0
    if (value === 0) {
      run++
      continue
    }
    while (run >= 16) {
      writeCoded(scan, acTable, 0xf0, 0, 0)
      run -= 16
    }
    const category = bitCategory(value)
    writeCoded(scan, acTable, (run << 4) | category, value, category)
    run = 0
  }
  if (run > 0) writeCoded(scan, acTable, 0, 0, 0)
  return dc
}

function sampleAt(samples: Uint8Array, width: number, height: number, channel: number, x: number, y: number): number {
  const px = Math.min(width - 1, x)
  const py = Math.min(height - 1, y)
  return (samples[(py * width + px) * 4 + channel] ?? 0) - 128
}

function encodeBlock(
  samples: Uint8Array,
  width: number,
  height: number,
  channel: number,
  blockX: number,
  blockY: number,
  table: Uint8Array,
  spatial: Float64Array,
  frequency: Float64Array,
): Int32Array {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) spatial[y * 8 + x] = sampleAt(samples, width, height, channel, blockX * 8 + x, blockY * 8 + y)
  }
  return quantizeZigzag(forwardDct(spatial, frequency), table)
}

function writeQuantTable(bytes: number[], table: Uint8Array): void {
  bytes.push(0xff, 0xdb)
  writeU16(bytes, 67)
  bytes.push(0)
  for (let index = 0; index < 64; index++) bytes.push(table[ZIGZAG[index] ?? 0] ?? 1)
}

function writeHuffmanTable(bytes: number[], tableClass: number, ident: number, bits: readonly number[], values: readonly number[]): void {
  bytes.push(0xff, 0xc4)
  writeU16(bytes, 19 + values.length)
  bytes.push((tableClass << 4) | ident)
  writeRaw(bytes, bits)
  writeRaw(bytes, values)
}

function writeHeaders(bytes: number[], width: number, height: number, table: Uint8Array): void {
  bytes.push(0xff, 0xd8)
  // APP14 transform 0 marks four components as CMYK, not YCCK. Samples are PDF DeviceCMYK
  // (0 = no ink). No Decode array: Poppler, pdf.js and Acrobat apply DCTDecode then the
  // default [0 1 0 1 0 1 0 1], so they read the same ink values. Photoshop-inverted CMYK
  // JPEGs would need Decode [1 0 ...]; this encoder does not invert.
  bytes.push(0xff, 0xee)
  writeU16(bytes, 14)
  writeRaw(bytes, [0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 0])
  writeQuantTable(bytes, table)
  bytes.push(0xff, 0xc0)
  writeU16(bytes, 20)
  bytes.push(8)
  writeU16(bytes, height)
  writeU16(bytes, width)
  bytes.push(4)
  for (let component = 1; component <= 4; component++) bytes.push(component, 0x11, 0)
  writeHuffmanTable(bytes, 0, 0, DC_LUM_BITS, DC_LUM_VALUES)
  writeHuffmanTable(bytes, 1, 0, AC_LUM_BITS, AC_LUM_VALUES)
  bytes.push(0xff, 0xda)
  writeU16(bytes, 14)
  bytes.push(4)
  for (let component = 1; component <= 4; component++) bytes.push(component, 0)
  bytes.push(0, 63, 0)
}

function encodeScan(scan: Scan, width: number, height: number, samples: Uint8Array, table: Uint8Array, dcTable: HuffmanCode[], acTable: HuffmanCode[]): void {
  const spatial = new Float64Array(64)
  const frequency = new Float64Array(64)
  const previousDc = [0, 0, 0, 0]
  const mcuWidth = Math.ceil(width / 8)
  const mcuHeight = Math.ceil(height / 8)
  for (let blockY = 0; blockY < mcuHeight; blockY++) {
    for (let blockX = 0; blockX < mcuWidth; blockX++) {
      for (let channel = 0; channel < 4; channel++) {
        const coeffs = encodeBlock(samples, width, height, channel, blockX, blockY, table, spatial, frequency)
        previousDc[channel] = writeBlock(scan, dcTable, acTable, coeffs, previousDc[channel] ?? 0)
      }
    }
  }
}

export function encodeCmykJpeg(width: number, height: number, samples: Uint8Array, quality: number): Uint8Array {
  const table = scaleLuminanceQuant(quality)
  const bytes: number[] = []
  writeHeaders(bytes, width, height, table)
  const scan: Scan = { bytes, current: 0, filled: 0 }
  encodeScan(scan, width, height, samples, table, huffmanCodes(DC_LUM_BITS, DC_LUM_VALUES), huffmanCodes(AC_LUM_BITS, AC_LUM_VALUES))
  padScan(scan)
  bytes.push(0xff, 0xd9)
  return Uint8Array.from(bytes)
}
