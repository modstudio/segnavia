import { RenderRefusedError } from '../errors.ts'

export const DEFAULT_IMAGE_ENCODING = 'lossless'
export const DEFAULT_IMAGE_QUALITY = 85

export type PressImageEncoding = 'lossless' | 'jpeg'

export interface PressImageOptionFields {
  images?: 'keep' | 'convert'
  imageEncoding?: PressImageEncoding
  imageQuality?: number
}

export function assertPressImageOptions(press: PressImageOptionFields): void {
  const images = press.images ?? 'keep'
  const encoding = press.imageEncoding
  const quality = press.imageQuality
  if (encoding !== undefined && encoding !== 'lossless' && encoding !== 'jpeg')
    throw new RenderRefusedError(`The press image encoding is ${String(encoding)}; supported: lossless or jpeg.`)
  if (encoding !== undefined && images !== 'convert')
    throw new RenderRefusedError("The press image encoding is set without images: 'convert'; set images: 'convert' to encode converted images.")
  if (quality !== undefined && (encoding ?? 'lossless') !== 'jpeg')
    throw new RenderRefusedError("The press image quality is set with lossless encoding; set imageEncoding: 'jpeg' to use imageQuality.")
  if (quality !== undefined && (!Number.isInteger(quality) || quality < 1 || quality > 100))
    throw new RenderRefusedError(`The press image quality is ${String(quality)}; supported: an integer from 1 to 100.`)
}
