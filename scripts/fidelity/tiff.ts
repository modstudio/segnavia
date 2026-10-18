const TYPE_BYTES: Readonly<Record<number, number>> = { 1: 1, 3: 2, 4: 4 }

interface TiffEntry {
  type: number
  count: number
  offset: number
}

function tiffView(bytes: Uint8Array): { view: DataView; littleEndian: boolean; entries: Map<number, TiffEntry> } {
  if (bytes.byteLength < 8) throw new Error('The TIFF is too short.')
  const signature = new TextDecoder().decode(bytes.subarray(0, 2))
  const littleEndian = signature === 'II'
  if (!littleEndian && signature !== 'MM') throw new Error('The device raster is not a TIFF.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(2, littleEndian) !== 42) throw new Error('The device raster has an unsupported TIFF version.')
  const ifd = view.getUint32(4, littleEndian)
  const count = view.getUint16(ifd, littleEndian)
  const entries = new Map<number, TiffEntry>()
  for (let index = 0; index < count; index++) {
    const offset = ifd + 2 + index * 12
    entries.set(view.getUint16(offset, littleEndian), {
      type: view.getUint16(offset + 2, littleEndian),
      count: view.getUint32(offset + 4, littleEndian),
      offset: offset + 8,
    })
  }
  return { view, littleEndian, entries }
}

function values(bytes: Uint8Array, view: DataView, littleEndian: boolean, entry: TiffEntry | undefined, name: string): number[] {
  if (!entry) throw new Error(`The device TIFF has no ${name} tag.`)
  const byteSize = TYPE_BYTES[entry.type]
  if (!byteSize) throw new Error(`The device TIFF ${name} tag has unsupported type ${entry.type}.`)
  const total = entry.count * byteSize
  const start = total <= 4 ? entry.offset : view.getUint32(entry.offset, littleEndian)
  if (start + total > bytes.byteLength) throw new Error(`The device TIFF ${name} tag points outside the file.`)
  return Array.from({ length: entry.count }, (_, index) => {
    const offset = start + index * byteSize
    if (entry.type === 1) return view.getUint8(offset)
    if (entry.type === 3) return view.getUint16(offset, littleEndian)
    return view.getUint32(offset, littleEndian)
  })
}

export function decodeDeviceTiff(bytes: Uint8Array, width: number, height: number, channels: 1 | 4): Uint8Array {
  const { view, littleEndian, entries } = tiffView(bytes)
  const scalar = (tag: number, name: string): number => values(bytes, view, littleEndian, entries.get(tag), name)[0] ?? 0
  if (scalar(256, 'ImageWidth') !== width || scalar(257, 'ImageLength') !== height) {
    throw new Error(`Unexpected device TIFF size; expected ${width}x${height}.`)
  }
  if (scalar(259, 'Compression') !== 1) throw new Error('The device TIFF is compressed; expected uncompressed samples.')
  if (scalar(277, 'SamplesPerPixel') !== channels) throw new Error(`Unexpected device TIFF channel count; expected ${channels}.`)
  if (scalar(284, 'PlanarConfiguration') !== 1) throw new Error('The device TIFF uses planar samples; expected packed samples.')
  const bits = values(bytes, view, littleEndian, entries.get(258), 'BitsPerSample')
  if (bits.length !== channels || bits.some((value) => value !== 8)) throw new Error('The device TIFF does not use 8-bit samples.')
  const expectedPhotometric = channels === 4 ? 5 : 1
  if (scalar(262, 'PhotometricInterpretation') !== expectedPhotometric) throw new Error('The device TIFF has an unexpected photometric interpretation.')
  const offsets = values(bytes, view, littleEndian, entries.get(273), 'StripOffsets')
  const sizes = values(bytes, view, littleEndian, entries.get(279), 'StripByteCounts')
  if (offsets.length !== sizes.length) throw new Error('The device TIFF strip tables have different lengths.')
  const result = new Uint8Array(width * height * channels)
  let destination = 0
  for (let index = 0; index < offsets.length; index++) {
    const offset = offsets[index] ?? 0
    const size = sizes[index] ?? 0
    if (offset + size > bytes.byteLength || destination + size > result.length) throw new Error('The device TIFF strip points outside its pixel buffer.')
    result.set(bytes.subarray(offset, offset + size), destination)
    destination += size
  }
  if (destination !== result.length) throw new Error(`Unexpected device TIFF pixel length ${destination}; expected ${result.length}.`)
  return result
}
