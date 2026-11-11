import { RenderRefusedError } from './errors.ts'

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

export function imageMime(bytes: Uint8Array): ImageMime {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (bytes.length >= 8 && text(1, 4) === 'PNG') return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  throw new RenderRefusedError('The image format is unsupported; supply a PNG, JPEG, or WebP image to clear this refusal.')
}
