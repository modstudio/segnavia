import { IDML_LIMITS, type IdmlLimits } from './limits.ts'

const END_SIGNATURE = 0x0605_4b50
const CENTRAL_SIGNATURE = 0x0201_4b50
const LOCAL_SIGNATURE = 0x0403_4b50
const MAX_END_SEARCH = 65_535 + 22

export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

interface CentralEntry {
  name: string
  flags: number
  method: number
  compressedSize: number
  inflatedSize: number
  localOffset: number
}

function refusal(subject: string, clear: string): Error {
  return new Error(`${subject}; ${clear} to clear this refusal`)
}

function range(view: DataView, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw refusal(`the ZIP ${label} is outside the package`, 'export a complete IDML package')
  }
}

function findEnd(view: DataView): number {
  const first = Math.max(0, view.byteLength - MAX_END_SEARCH)
  for (let offset = view.byteLength - 22; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) return offset
  }
  throw refusal('the ZIP end-of-central-directory record is missing', 'export a complete IDML package')
}

function validateCentralEntry(entry: CentralEntry, startDisk: number, names: Set<string>): void {
  if ((entry.flags & 0x41) !== 0) throw refusal(`ZIP entry ${entry.name} is encrypted`, 'export the IDML without ZIP encryption')
  if (startDisk !== 0) throw refusal(`ZIP entry ${entry.name} spans disks`, 'place every entry in one ordinary ZIP disk')
  if (entry.compressedSize === 0xffff_ffff || entry.inflatedSize === 0xffff_ffff || entry.localOffset === 0xffff_ffff) {
    throw refusal(`ZIP entry ${entry.name} uses ZIP64`, 'export an ordinary ZIP package within the named IDML limits')
  }
  if (entry.method !== 0 && entry.method !== 8) {
    throw refusal(`ZIP entry ${entry.name} uses compression method ${entry.method}`, 'store it or use the deflate compression method')
  }
  if (names.has(entry.name)) throw refusal(`the ZIP contains duplicate entry ${entry.name}`, 'give every IDML part one unique package path')
  names.add(entry.name)
}

function centralEntries(view: DataView, limits: IdmlLimits): CentralEntry[] {
  const end = findEnd(view)
  range(view, end, 22, 'end-of-central-directory record')
  const disk = view.getUint16(end + 4, true)
  const centralDisk = view.getUint16(end + 6, true)
  const diskEntries = view.getUint16(end + 8, true)
  const entries = view.getUint16(end + 10, true)
  const centralSize = view.getUint32(end + 12, true)
  const centralOffset = view.getUint32(end + 16, true)
  const commentLength = view.getUint16(end + 20, true)
  range(view, end, 22 + commentLength, 'end-of-central-directory record')
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries) {
    throw refusal('ZIP entries spanning disks are not supported', 'place every entry in one ordinary ZIP disk')
  }
  if (entries === 0xffff || centralSize === 0xffff_ffff || centralOffset === 0xffff_ffff) {
    throw refusal('ZIP64 is not supported', 'export an ordinary ZIP package within the named IDML limits')
  }
  if (entries > limits.entries) {
    throw refusal(`the ZIP entry count ${entries} exceeds the ${limits.entries} entry limit`, `reduce the package to ${limits.entries} entries or fewer`)
  }
  range(view, centralOffset, centralSize, 'central directory')
  const decoder = new TextDecoder()
  const result: CentralEntry[] = []
  const names = new Set<string>()
  let offset = centralOffset
  for (let index = 0; index < entries; index += 1) {
    range(view, offset, 46, 'central-directory entry')
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw refusal(`ZIP central-directory entry ${index + 1} is invalid`, 'export a complete IDML package')
    }
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const inflatedSize = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const entryCommentLength = view.getUint16(offset + 32, true)
    const startDisk = view.getUint16(offset + 34, true)
    const localOffset = view.getUint32(offset + 42, true)
    const recordLength = 46 + nameLength + extraLength + entryCommentLength
    range(view, offset, recordLength, 'central-directory entry')
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 46, nameLength))
    const entry = { name, flags, method, compressedSize, inflatedSize, localOffset }
    validateCentralEntry(entry, startDisk, names)
    result.push(entry)
    offset += recordLength
  }
  if (offset !== centralOffset + centralSize) {
    throw refusal('the ZIP central-directory size does not match its entries', 'export a complete IDML package')
  }
  return result
}

async function inflatedStream(bytes: Uint8Array, entry: CentralEntry): Promise<ReadableStream<Uint8Array>> {
  const source = new Blob([bytes.slice().buffer]).stream() as ReadableStream<Uint8Array>
  if (entry.method === 0) return source
  if (typeof DecompressionStream === 'undefined') {
    throw refusal('DecompressionStream is unavailable at run time', 'use a runtime with DecompressionStream deflate-raw support or store every ZIP entry')
  }
  try {
    const decompressor = new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>
    return source.pipeThrough(decompressor)
  } catch {
    throw refusal(
      'DecompressionStream does not support deflate-raw at run time',
      'use a runtime with DecompressionStream deflate-raw support or store every ZIP entry',
    )
  }
}

async function inflate(bytes: Uint8Array, entry: CentralEntry, limits: IdmlLimits, total: { bytes: number }): Promise<Uint8Array> {
  if (entry.inflatedSize > limits.partBytes) {
    throw refusal(
      `ZIP entry ${entry.name} declares ${entry.inflatedSize} inflated bytes, exceeding the ${limits.partBytes} byte per-part limit`,
      `reduce that part to ${limits.partBytes} bytes or fewer`,
    )
  }
  const reader = (await inflatedStream(bytes, entry)).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    total.bytes += next.value.byteLength
    if (size > limits.partBytes) {
      await reader.cancel()
      throw refusal(
        `ZIP entry ${entry.name} exceeds the ${limits.partBytes} byte inflated per-part limit`,
        `reduce that part to ${limits.partBytes} bytes or fewer`,
      )
    }
    if (total.bytes > limits.totalInflatedBytes) {
      await reader.cancel()
      throw refusal(
        `the ZIP exceeds the ${limits.totalInflatedBytes} byte total inflated limit`,
        `reduce all inflated parts to ${limits.totalInflatedBytes} bytes or fewer`,
      )
    }
    chunks.push(next.value)
  }
  if (size !== entry.inflatedSize) {
    throw refusal(`ZIP entry ${entry.name} declared ${entry.inflatedSize} inflated bytes but produced ${size}`, 'export a complete IDML package')
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function compressedBytes(bytes: Uint8Array, view: DataView, entry: CentralEntry): Uint8Array {
  range(view, entry.localOffset, 30, `local header for ${entry.name}`)
  if (view.getUint32(entry.localOffset, true) !== LOCAL_SIGNATURE) {
    throw refusal(`the ZIP local header for ${entry.name} is invalid`, 'export a complete IDML package')
  }
  const localFlags = view.getUint16(entry.localOffset + 6, true)
  const localMethod = view.getUint16(entry.localOffset + 8, true)
  if ((localFlags & 0x41) !== 0) throw refusal(`ZIP entry ${entry.name} is encrypted`, 'export the IDML without ZIP encryption')
  if (localMethod !== entry.method) throw refusal(`ZIP entry ${entry.name} has conflicting compression methods`, 'export a complete IDML package')
  const nameLength = view.getUint16(entry.localOffset + 26, true)
  const extraLength = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLength + extraLength
  range(view, start, entry.compressedSize, `data for ${entry.name}`)
  return bytes.subarray(start, start + entry.compressedSize)
}

export async function readZip(bytes: Uint8Array, limits: IdmlLimits = IDML_LIMITS): Promise<ZipEntry[]> {
  if (bytes.byteLength > limits.packageBytes) {
    throw refusal(
      `the IDML package has ${bytes.byteLength} bytes, exceeding the ${limits.packageBytes} byte package limit`,
      `reduce the package to ${limits.packageBytes} bytes or fewer`,
    )
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries = centralEntries(view, limits)
  const result: ZipEntry[] = []
  const total = { bytes: 0 }
  for (const entry of entries) {
    result.push({ name: entry.name, bytes: await inflate(compressedBytes(bytes, view, entry), entry, limits, total) })
  }
  return result
}
