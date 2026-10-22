import type { PDFRawStream } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { numberOf } from './pdf-objects.ts'

export const MAX_IMAGE_PIXELS = 50_000_000
export const MAX_TOTAL_IMAGE_PIXELS = 400_000_000
export const MAX_IMAGE_BYTES = 200_000_000
export const MAX_TOTAL_IMAGE_BYTES = 800_000_000
export const MAX_IMAGE_DECODED_BYTES = 200_000_000
export const MAX_TOTAL_IMAGE_DECODED_BYTES = 800_000_000
export const MAX_IMAGE_OUTPUT_BYTES = 200_000_000
export const MAX_TOTAL_IMAGE_OUTPUT_BYTES = 800_000_000

const refuse = (found: string, supported: string): never => {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}

export function chargeImageLimits(state: { bytes: number; pixels: number }, image: PDFRawStream): { height: number; pixels: number; width: number } {
  const width = numberOf(image.dict, 'Width') ?? refuse('image Width missing', 'a positive Width number')
  const height = numberOf(image.dict, 'Height') ?? refuse('image Height missing', 'a positive Height number')
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    refuse(`image dimensions ${width}x${height}`, 'positive integer Width and Height')
  const pixels = width * height
  if (pixels > MAX_IMAGE_PIXELS) refuse(`image pixel count ${pixels}`, `at most ${MAX_IMAGE_PIXELS} pixels in one image`)
  state.pixels += pixels
  if (state.pixels > MAX_TOTAL_IMAGE_PIXELS) refuse(`total image pixel count ${state.pixels}`, `at most ${MAX_TOTAL_IMAGE_PIXELS} pixels in one render`)
  const bytes = image.contents.length
  if (bytes > MAX_IMAGE_BYTES) refuse(`image encoded byte count ${bytes}`, `at most ${MAX_IMAGE_BYTES} bytes in one image`)
  state.bytes += bytes
  if (state.bytes > MAX_TOTAL_IMAGE_BYTES) refuse(`total image encoded byte count ${state.bytes}`, `at most ${MAX_TOTAL_IMAGE_BYTES} bytes in one render`)
  return { height, pixels, width }
}

export function chargeDecodedImageBytes(state: { decodedBytes: number }, bytes: number): void {
  if (bytes > MAX_IMAGE_DECODED_BYTES) refuse(`image decoded byte count ${bytes}`, `at most ${MAX_IMAGE_DECODED_BYTES} decoded bytes in one image`)
  state.decodedBytes += bytes
  if (state.decodedBytes > MAX_TOTAL_IMAGE_DECODED_BYTES)
    refuse(`total image decoded byte count ${state.decodedBytes}`, `at most ${MAX_TOTAL_IMAGE_DECODED_BYTES} decoded bytes in one render`)
}

export function chargeOutputImageBytes(state: { outputBytes: number }, bytes: number, imageBytes = bytes): void {
  if (imageBytes > MAX_IMAGE_OUTPUT_BYTES) refuse(`image output byte count ${imageBytes}`, `at most ${MAX_IMAGE_OUTPUT_BYTES} output bytes in one image`)
  state.outputBytes += bytes
  if (state.outputBytes > MAX_TOTAL_IMAGE_OUTPUT_BYTES)
    refuse(`total image output byte count ${state.outputBytes}`, `at most ${MAX_TOTAL_IMAGE_OUTPUT_BYTES} output bytes in one render`)
}
