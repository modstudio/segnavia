export interface TestZipEntry {
  name: string
  content: string | Uint8Array
  method?: 0 | 8 | number
  flags?: number
  disk?: number
  declaredInflatedSize?: number
  declaredCompressedSize?: number
  localOffset?: number
  truncateCompressedBytes?: number
}

export interface TestZipOptions {
  disk?: number
  centralDisk?: number
  diskEntries?: number
  entries?: number
  centralSize?: number
  centralOffset?: number
}

function join(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const compressor = new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(compressor)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function compressedContent(content: Uint8Array, entry: TestZipEntry): Promise<Uint8Array> {
  const complete = entry.method === 8 ? await deflate(content) : content
  return complete.subarray(0, Math.max(0, complete.byteLength - (entry.truncateCompressedBytes ?? 0)))
}

function record(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size)
  return { bytes, view: new DataView(bytes.buffer) }
}

export async function testZip(entries: TestZipEntry[], options: TestZipOptions = {}): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const content = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content
    const method = entry.method ?? 0
    const compressed = await compressedContent(content, entry)
    const local = record(30 + name.byteLength + compressed.byteLength)
    local.view.setUint32(0, 0x0403_4b50, true)
    local.view.setUint16(4, 20, true)
    local.view.setUint16(6, entry.flags ?? 0, true)
    local.view.setUint16(8, method, true)
    local.view.setUint32(18, entry.declaredCompressedSize ?? compressed.byteLength, true)
    local.view.setUint32(22, entry.declaredInflatedSize ?? content.byteLength, true)
    local.view.setUint16(26, name.byteLength, true)
    local.bytes.set(name, 30)
    local.bytes.set(compressed, 30 + name.byteLength)
    localParts.push(local.bytes)

    const central = record(46 + name.byteLength)
    central.view.setUint32(0, 0x0201_4b50, true)
    central.view.setUint16(4, 20, true)
    central.view.setUint16(6, 20, true)
    central.view.setUint16(8, entry.flags ?? 0, true)
    central.view.setUint16(10, method, true)
    central.view.setUint32(20, entry.declaredCompressedSize ?? compressed.byteLength, true)
    central.view.setUint32(24, entry.declaredInflatedSize ?? content.byteLength, true)
    central.view.setUint16(28, name.byteLength, true)
    central.view.setUint16(34, entry.disk ?? 0, true)
    central.view.setUint32(42, entry.localOffset ?? localOffset, true)
    central.bytes.set(name, 46)
    centralParts.push(central.bytes)
    localOffset += local.bytes.byteLength
  }
  const central = join(centralParts)
  const end = record(22)
  end.view.setUint32(0, 0x0605_4b50, true)
  end.view.setUint16(4, options.disk ?? 0, true)
  end.view.setUint16(6, options.centralDisk ?? 0, true)
  end.view.setUint16(8, options.diskEntries ?? entries.length, true)
  end.view.setUint16(10, options.entries ?? entries.length, true)
  end.view.setUint32(12, options.centralSize ?? central.byteLength, true)
  end.view.setUint32(16, options.centralOffset ?? localOffset, true)
  return join([...localParts, central, end.bytes])
}
