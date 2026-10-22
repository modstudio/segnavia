import { dequantize, inverseDct } from './jpeg-dct.ts'
import { ZIGZAG } from './jpeg-tables.ts'

interface BitReader {
  bytes: Uint8Array
  offset: number
  current: number
  filled: number
}

function readByte(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0
}

function skipFill(bytes: Uint8Array, offset: number): number {
  let at = offset
  while (readByte(bytes, at) === 0xff && readByte(bytes, at + 1) === 0xff) at++
  return at
}

function markerAt(bytes: Uint8Array, offset: number): { code: number; payload: Uint8Array; next: number } {
  const at = skipFill(bytes, offset)
  if (readByte(bytes, at) !== 0xff) throw new Error(`expected marker at ${at}`)
  const code = readByte(bytes, at + 1)
  if (code === 0xd8 || code === 0xd9) return { code, payload: new Uint8Array(), next: at + 2 }
  const length = (readByte(bytes, at + 2) << 8) | readByte(bytes, at + 3)
  return { code, payload: bytes.subarray(at + 4, at + 2 + length), next: at + 2 + length }
}

function buildDecode(bits: Uint8Array, values: Uint8Array): Map<number, number> {
  const codes = new Map<number, number>()
  let code = 0
  let at = 0
  for (let length = 1; length <= 16; length++) {
    for (let n = 0; n < (bits[length - 1] ?? 0); n++) {
      codes.set((length << 16) | code, values[at++] ?? 0)
      code++
    }
    code <<= 1
  }
  return codes
}

function readBit(reader: BitReader): number {
  if (reader.filled === 0) {
    const value = readByte(reader.bytes, reader.offset)
    reader.offset++
    if (value === 0xff) {
      if (readByte(reader.bytes, reader.offset) !== 0) throw new Error('unstuffed FF in scan')
      reader.offset++
    }
    reader.current = value
    reader.filled = 8
  }
  reader.filled--
  return (reader.current >> reader.filled) & 1
}

function readBits(reader: BitReader, count: number): number {
  let value = 0
  for (let bit = 0; bit < count; bit++) value = (value << 1) | readBit(reader)
  return value
}

function decodeSymbol(reader: BitReader, table: Map<number, number>): number {
  let code = 0
  for (let length = 1; length <= 16; length++) {
    code = (code << 1) | readBit(reader)
    const symbol = table.get((length << 16) | code)
    if (symbol !== undefined) return symbol
  }
  throw new Error('huffman symbol not found')
}

function receiveExtend(reader: BitReader, category: number): number {
  if (category === 0) return 0
  const bits = readBits(reader, category)
  const vt = 1 << (category - 1)
  return bits < vt ? bits + (-1 << category) + 1 : bits
}

function decodeBlock(reader: BitReader, dcTable: Map<number, number>, acTable: Map<number, number>, previousDc: number): { coeffs: Int32Array; dc: number } {
  const coeffs = new Int32Array(64)
  const dc = previousDc + receiveExtend(reader, decodeSymbol(reader, dcTable))
  coeffs[0] = dc
  for (let index = 1; index < 64; ) {
    const symbol = decodeSymbol(reader, acTable)
    if (symbol === 0) break
    if (symbol === 0xf0) {
      index += 16
      continue
    }
    index += symbol >> 4
    if (index < 64) coeffs[index] = receiveExtend(reader, symbol & 15)
    index++
  }
  return { coeffs, dc }
}

function naturalFromZigzag(zigzag: Int32Array): Int32Array {
  const natural = new Int32Array(64)
  for (let index = 0; index < 64; index++) natural[ZIGZAG[index] ?? 0] = zigzag[index] ?? 0
  return natural
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

interface JpegTables {
  acTables: Array<Map<number, number> | undefined>
  app14: Uint8Array | undefined
  dcTables: Array<Map<number, number> | undefined>
  height: number
  quant: Uint8Array
  scanAt: number
  width: number
}

function readQuant(payload: Uint8Array, quant: Uint8Array): void {
  for (let index = 0; index < 64; index++) quant[ZIGZAG[index] ?? 0] = payload[index + 1] ?? 1
}

function readHuffman(payload: Uint8Array, dcTables: Array<Map<number, number> | undefined>, acTables: Array<Map<number, number> | undefined>): void {
  const ident = payload[0] ?? 0
  const table = buildDecode(payload.subarray(1, 17), payload.subarray(17))
  if (ident >> 4 === 0) dcTables[ident & 15] = table
  else acTables[ident & 15] = table
}

function readHeaders(bytes: Uint8Array): JpegTables {
  if (readByte(bytes, 0) !== 0xff || readByte(bytes, 1) !== 0xd8) throw new Error('missing SOI')
  const tables: JpegTables = { acTables: [], app14: undefined, dcTables: [], height: 0, quant: new Uint8Array(64), scanAt: 2, width: 0 }
  while (tables.scanAt < bytes.length) {
    const marker = markerAt(bytes, tables.scanAt)
    tables.scanAt = marker.next
    if (marker.code === 0xee) tables.app14 = marker.payload
    if (marker.code === 0xdb) readQuant(marker.payload, tables.quant)
    if (marker.code === 0xc4) readHuffman(marker.payload, tables.dcTables, tables.acTables)
    if (marker.code === 0xc0) {
      tables.height = ((marker.payload[1] ?? 0) << 8) | (marker.payload[2] ?? 0)
      tables.width = ((marker.payload[3] ?? 0) << 8) | (marker.payload[4] ?? 0)
    }
    if (marker.code === 0xda) break
  }
  return tables
}

function paintBlock(samples: Uint8Array, width: number, height: number, channel: number, blockX: number, blockY: number, spatial: Float64Array): void {
  for (let y = 0; y < 8; y++) {
    const py = blockY * 8 + y
    if (py >= height) continue
    for (let x = 0; x < 8; x++) {
      const px = blockX * 8 + x
      if (px >= width) continue
      samples[(py * width + px) * 4 + channel] = clampByte((spatial[y * 8 + x] ?? 0) + 128)
    }
  }
}

function decodeScan(bytes: Uint8Array, tables: JpegTables): Uint8Array {
  const dcTable = tables.dcTables[0]
  const acTable = tables.acTables[0]
  if (!dcTable || !acTable) throw new Error('missing Huffman tables')
  const { width, height, quant } = tables
  const reader: BitReader = { bytes, current: 0, filled: 0, offset: tables.scanAt }
  const samples = new Uint8Array(width * height * 4)
  const previousDc = [0, 0, 0, 0]
  for (let blockY = 0; blockY < Math.ceil(height / 8); blockY++) {
    for (let blockX = 0; blockX < Math.ceil(width / 8); blockX++) {
      for (let channel = 0; channel < 4; channel++) {
        const decoded = decodeBlock(reader, dcTable, acTable, previousDc[channel] ?? 0)
        previousDc[channel] = decoded.dc
        paintBlock(samples, width, height, channel, blockX, blockY, inverseDct(dequantize(naturalFromZigzag(decoded.coeffs), quant)))
      }
    }
  }
  return samples
}

export function decodeBaselineCmykJpeg(bytes: Uint8Array): { width: number; height: number; samples: Uint8Array; app14: Uint8Array | undefined } {
  const tables = readHeaders(bytes)
  return { app14: tables.app14, height: tables.height, samples: decodeScan(bytes, tables), width: tables.width }
}
