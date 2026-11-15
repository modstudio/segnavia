import { inflateSync } from 'node:zlib'
import { RenderRefusedError } from './errors.ts'

export const MAX_PDF_FILTER_CHAIN = 8

export type PdfStreamFilter = 'FlateDecode' | 'LZWDecode' | 'ASCII85Decode' | 'ASCIIHexDecode' | 'RunLengthDecode'

function overLimit(object: number, limit: number): never {
  throw new RenderRefusedError(
    `Received PDF stream object ${object} decodes above the limits.input.streamBytes limit of ${limit} bytes; raise the host's limits.input.streamBytes, or use a PDF with smaller object and cross-reference streams, to clear this refusal.`,
  )
}

function bounded(bytes: Uint8Array, object: number, limit: number): Uint8Array {
  if (bytes.byteLength > limit) overLimit(object, limit)
  return bytes
}

function isWhitespace(byte: number): boolean {
  return byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32
}

function hexDigit(byte: number): number {
  if (byte >= 48 && byte <= 57) return byte - 48
  if (byte >= 65 && byte <= 70) return byte - 55
  if (byte >= 97 && byte <= 102) return byte - 87
  return -1
}

function asciiHex(input: Uint8Array, object: number, limit: number): Uint8Array {
  const digits: number[] = []
  for (const byte of input) {
    if (byte === 0x3e) break
    if (isWhitespace(byte)) continue
    const digit = hexDigit(byte)
    if (digit < 0) throw new Error('invalid ASCIIHexDecode data')
    digits.push(digit)
    if (Math.ceil(digits.length / 2) > limit) overLimit(object, limit)
  }
  const output = new Uint8Array(Math.ceil(digits.length / 2))
  for (let index = 0; index < digits.length; index += 2) output[index / 2] = (digits[index] as number) * 16 + (digits[index + 1] ?? 0)
  return output
}

function ascii85(input: Uint8Array, object: number, limit: number): Uint8Array {
  const output: number[] = []
  let group: number[] = []
  const append = (value: number, count: number) => appendAscii85(output, value, count, object, limit)
  for (let index = 0; index < input.length; index += 1) {
    const byte = input[index] as number
    if (isWhitespace(byte)) continue
    if (byte === 0x7e && input[index + 1] === 0x3e) break
    if (byte === 0x7a) {
      if (group.length) throw new Error('invalid ASCII85Decode data')
      append(0, 4)
      continue
    }
    if (byte < 33 || byte > 117) throw new Error('invalid ASCII85Decode data')
    group.push(byte - 33)
    if (group.length === 5) {
      append(ascii85Value(group), 4)
      group = []
    }
  }
  if (group.length === 1) throw new Error('invalid ASCII85Decode data')
  if (group.length > 1) {
    const count = group.length - 1
    append(ascii85Value([...group, ...Array.from({ length: 5 - group.length }, () => 84)]), count)
  }
  return Uint8Array.from(output)
}

function ascii85Value(group: readonly number[]): number {
  return group.reduce((value, digit) => value * 85 + digit, 0) >>> 0
}

function appendAscii85(output: number[], value: number, count: number, object: number, limit: number): void {
  for (let shift = 24; shift >= 32 - count * 8; shift -= 8) output.push((value >>> shift) & 0xff)
  if (output.length > limit) overLimit(object, limit)
}

function runLength(input: Uint8Array, object: number, limit: number): Uint8Array {
  const output: number[] = []
  for (let index = 0; index < input.length; ) {
    const length = input[index++] as number
    if (length === 128) break
    if (length < 128) {
      const end = index + length + 1
      if (end > input.length) throw new Error('invalid RunLengthDecode data')
      for (; index < end; index += 1) output.push(input[index] as number)
    } else {
      if (index >= input.length) throw new Error('invalid RunLengthDecode data')
      const value = input[index++] as number
      for (let count = 0; count < 257 - length; count += 1) output.push(value)
    }
    if (output.length > limit) overLimit(object, limit)
  }
  return Uint8Array.from(output)
}

class BitReader {
  private bit = 0
  constructor(private readonly bytes: Uint8Array) {}
  read(width: number): number | undefined {
    if (this.bit + width > this.bytes.length * 8) return undefined
    let value = 0
    for (let count = 0; count < width; count += 1) {
      const position = this.bit++
      value = (value << 1) | (((this.bytes[position >> 3] as number) >> (7 - (position & 7))) & 1)
    }
    return value
  }
}

function lzw(input: Uint8Array, object: number, limit: number): Uint8Array {
  const reader = new BitReader(input)
  let table: Uint8Array[] = []
  let width = 9
  let previous: Uint8Array | undefined
  const reset = () => {
    table = Array.from({ length: 256 }, (_, value) => Uint8Array.of(value))
    table.length = 258
    width = 9
    previous = undefined
  }
  reset()
  const output: number[] = []
  while (true) {
    const code = reader.read(width)
    if (code === undefined || code === 257) break
    if (code === 256) {
      reset()
      continue
    }
    let entry = table[code]
    if (!entry && code === table.length && previous) entry = Uint8Array.from([...previous, previous[0] as number])
    if (!entry) throw new Error('invalid LZWDecode data')
    output.push(...entry)
    if (output.length > limit) overLimit(object, limit)
    if (previous && table.length < 4096) {
      table.push(Uint8Array.from([...previous, entry[0] as number]))
      if (table.length === (1 << width) - 1 && width < 12) width += 1
    }
    previous = entry
  }
  return Uint8Array.from(output)
}

function decodeStage(input: Uint8Array, filter: PdfStreamFilter, object: number, limit: number): Uint8Array {
  if (filter === 'FlateDecode') {
    try {
      return bounded(inflateSync(input, { maxOutputLength: limit + 1 }), object, limit)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE') overLimit(object, limit)
      throw error
    }
  }
  if (filter === 'ASCIIHexDecode') return asciiHex(input, object, limit)
  if (filter === 'ASCII85Decode') return ascii85(input, object, limit)
  if (filter === 'RunLengthDecode') return runLength(input, object, limit)
  return lzw(input, object, limit)
}

export function decodePdfStreamBounded(input: Uint8Array, filters: readonly string[], object: number, limit: number): Uint8Array {
  if (filters.length > MAX_PDF_FILTER_CHAIN) {
    throw new RenderRefusedError(
      `Received PDF stream object ${object} has a decode filter chain of ${filters.length}, above the supported maximum of ${MAX_PDF_FILTER_CHAIN}; use at most ${MAX_PDF_FILTER_CHAIN} stream filters to clear this refusal.`,
    )
  }
  let output = filters.length === 0 ? bounded(input, object, limit) : input
  for (const filter of filters) {
    if (!['FlateDecode', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode'].includes(filter)) {
      throw new RenderRefusedError(
        `Received PDF stream object ${object} uses unsupported decode filter ${filter}; use FlateDecode, LZWDecode, ASCII85Decode, ASCIIHexDecode or RunLengthDecode for object and cross-reference streams to clear this refusal.`,
      )
    }
    try {
      output = decodeStage(output, filter as PdfStreamFilter, object, limit)
    } catch (error) {
      if (error instanceof RenderRefusedError) throw error
      throw new RenderRefusedError(`Received PDF stream object ${object} could not be decoded as ${filter}; use a valid PDF stream to clear this refusal.`)
    }
  }
  return output
}
