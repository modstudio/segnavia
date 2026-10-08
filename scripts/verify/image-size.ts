export interface ImageSize {
  width: number
  height: number
}

const text = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))

export function imageSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length >= 24 && text(bytes, 1, 4) === 'PNG') return { width: view.getUint32(16), height: view.getUint32(20) }
  if (bytes.length < 30 || text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 12) !== 'WEBP') return null
  const kind = text(bytes, 12, 16)
  if (kind === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
  if (kind === 'VP8L') {
    return {
      width: 1 + (bytes[21] as number) + (((bytes[22] as number) & 0x3f) << 8),
      height: 1 + ((bytes[22] as number) >> 6) + ((bytes[23] as number) << 2) + (((bytes[24] as number) & 0x0f) << 10),
    }
  }
  if (kind === 'VP8X') {
    const width = view.getUint16(24, true) + ((bytes[26] as number) << 16)
    const height = view.getUint16(27, true) + ((bytes[29] as number) << 16)
    return { width: width + 1, height: height + 1 }
  }
  return null
}
