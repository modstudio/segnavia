import { RenderRefusedError } from './errors.ts'
import { imageMime } from './image-format.ts'
import { isoDate, type OutputDate } from './output-date.ts'
import { pngChunk } from './png-chunk.ts'
import { xmpDatePacket } from './xmp.ts'

const ascii = (value: string) => new TextEncoder().encode(value)

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function uint32(value: number, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, littleEndian)
  return bytes
}

function stampPng(bytes: Uint8Array, date: OutputDate): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ihdrEnd = 8 + 12 + view.getUint32(8)
  const text = concat(ascii('Creation Time'), new Uint8Array([0]), ascii(isoDate(date)))
  return concat(bytes.subarray(0, ihdrEnd), pngChunk('tEXt', text), bytes.subarray(ihdrEnd))
}

function stampJpeg(bytes: Uint8Array, date: OutputDate): Uint8Array {
  let insertion = 2
  if (bytes[2] === 0xff && bytes[3] === 0xe0) insertion = 4 + new DataView(bytes.buffer, bytes.byteOffset + 4, 2).getUint16(0)
  const payload = concat(ascii('http://ns.adobe.com/xap/1.0/'), new Uint8Array([0]), xmpDatePacket(date))
  const length = payload.length + 2
  if (length > 0xffff) throw new RenderRefusedError('The JPEG output date metadata exceeds one APP1 segment; shorten the metadata to clear this refusal.')
  const header = new Uint8Array([0xff, 0xe1, length >>> 8, length & 0xff])
  return concat(bytes.subarray(0, insertion), header, payload, bytes.subarray(insertion))
}

function stampWebp(bytes: Uint8Array, date: OutputDate): Uint8Array {
  // Chromium's screenshot and canvas WebP encoders produce VP8X; this guards inputs the renderer does not produce.
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'VP8X') {
    throw new RenderRefusedError('The WebP output uses a simple container; render an extended WebP container to carry output date metadata.')
  }
  const packet = xmpDatePacket(date)
  const padding = packet.length % 2 === 0 ? new Uint8Array() : new Uint8Array(1)
  const chunk = concat(ascii('XMP '), uint32(packet.length, true), packet, padding)
  const output = concat(bytes, chunk)
  output[20] = (output[20] ?? 0) | 0x04
  new DataView(output.buffer).setUint32(4, output.length - 8, true)
  return output
}

export function stampImage(bytes: Uint8Array, date?: OutputDate): Uint8Array {
  if (!date) return bytes
  const mime = imageMime(bytes)
  switch (mime) {
    case 'image/png':
      return stampPng(bytes, date)
    case 'image/jpeg':
      return stampJpeg(bytes, date)
    case 'image/webp':
      return stampWebp(bytes, date)
    default: {
      const exhaustive: never = mime
      return exhaustive
    }
  }
}
