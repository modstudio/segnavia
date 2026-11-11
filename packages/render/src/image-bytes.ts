import { RenderLimitError } from './errors.ts'

export function enforceImageBytes(image: Uint8Array, limit?: number): Uint8Array {
  if (limit !== undefined && image.byteLength > limit) throw new RenderLimitError('bytes', image.byteLength, limit)
  return image
}
