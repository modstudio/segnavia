import type { Page as Tab } from 'playwright-core'
import { readProfile } from './color/profile.ts'
import { buildProofTable } from './color/proof.ts'
import type { ProofTable } from './color/types.ts'
import { RenderRefusedError } from './errors.ts'
import type { ImageOptions, ProofImageOptions } from './options.ts'
import { proofRgba } from './proof-image-transform.ts'

export const MAX_PROOF_IMAGE_PIXELS = 50_000_000
export const MAX_PROOF_IMAGE_BYTES = 200_000_000

const tables = new WeakMap<Uint8Array, ProofTable>()

function proofTable(bytes: Uint8Array): ProofTable {
  const cached = tables.get(bytes)
  if (cached) return cached
  let profile: ReturnType<typeof readProfile>
  try {
    profile = readProfile(bytes)
  } catch {
    throw new RenderRefusedError('The proof profile is malformed; supply a valid CMYK output profile to clear this refusal.')
  }
  if (profile.profileClass !== 'prtr' || profile.colorSpace !== 'CMYK')
    throw new RenderRefusedError(
      `The proof profile is not a CMYK output profile (class ${profile.profileClass}, color space ${profile.colorSpace.trim()}); supply a CMYK output profile to clear this refusal.`,
    )
  const table = buildProofTable(profile)
  tables.set(bytes, table)
  return table
}

function mimeOf(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (bytes.length >= 8 && text(1, 4) === 'PNG') return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  throw new RenderRefusedError('The proof image format is unsupported; supply a PNG, JPEG, or WebP image to clear this refusal.')
}

function boundedBytes(bytes: Uint8Array, part: 'input' | 'output'): void {
  if (bytes.byteLength > MAX_PROOF_IMAGE_BYTES)
    throw new RenderRefusedError(
      `The proof image ${part} is ${bytes.byteLength} bytes; the ceiling is ${MAX_PROOF_IMAGE_BYTES} bytes. Reduce the encoded image size to clear this refusal.`,
    )
}

async function decode(tab: Tab, bytes: Uint8Array): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  boundedBytes(bytes, 'input')
  const encoded = Buffer.from(bytes).toString('base64')
  const decoded = await tab.evaluate(
    async ({ encoded, maxPixels, mime }) => {
      const binary = atob(encoded)
      const source = Uint8Array.from(binary, (value) => value.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([source], { type: mime }), { colorSpaceConversion: 'default', premultiplyAlpha: 'none' })
      try {
        const pixels = bitmap.width * bitmap.height
        // Refuse before drawing so a small encoded file with huge dimensions never copies its pixels.
        if (!Number.isSafeInteger(pixels) || pixels > maxPixels) return { width: bitmap.width, height: bitmap.height }
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Chromium could not create a 2D canvas for proof decoding')
        context.drawImage(bitmap, 0, 0)
        const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
        let value = ''
        for (let offset = 0; offset < rgba.length; offset += 32_768)
          value += String.fromCharCode(...rgba.subarray(offset, Math.min(rgba.length, offset + 32_768)))
        return { width: bitmap.width, height: bitmap.height, rgba: btoa(value) }
      } finally {
        bitmap.close()
      }
    },
    { encoded, maxPixels: MAX_PROOF_IMAGE_PIXELS, mime: mimeOf(bytes) },
  )
  const pixels = decoded.width * decoded.height
  if (!Number.isSafeInteger(pixels) || pixels > MAX_PROOF_IMAGE_PIXELS)
    throw new RenderRefusedError(
      `The proof image has ${pixels} pixels; the ceiling is ${MAX_PROOF_IMAGE_PIXELS} pixels. Reduce its pixel dimensions to clear this refusal.`,
    )
  return { width: decoded.width, height: decoded.height, rgba: new Uint8Array(Buffer.from(decoded.rgba ?? '', 'base64')) }
}

function canvasQuality(quality?: number[]): number {
  return (quality?.[0] ?? 90) / 100
}

async function encode(
  tab: Tab,
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
  format: NonNullable<ProofImageOptions['format']>,
  quality?: number[],
): Promise<Uint8Array> {
  const encoded = Buffer.from(rgba).toString('base64')
  const base64 = await tab.evaluate(
    async ({ encoded, format, height, quality, width }) => {
      const binary = atob(encoded)
      const pixels = Uint8ClampedArray.from(binary, (value) => value.charCodeAt(0))
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Chromium could not create a 2D canvas for proof encoding')
      context.putImageData(new ImageData(pixels, width, height), 0, 0)
      const blob = await canvas.convertToBlob({ type: `image/${format}`, quality })
      const output = new Uint8Array(await blob.arrayBuffer())
      let value = ''
      for (let offset = 0; offset < output.length; offset += 32_768)
        value += String.fromCharCode(...output.subarray(offset, Math.min(output.length, offset + 32_768)))
      return btoa(value)
    },
    { encoded, format, height, quality: canvasQuality(quality), width },
  )
  const output = new Uint8Array(Buffer.from(base64, 'base64'))
  boundedBytes(output, 'output')
  return output
}

export async function proofRasterImage(tab: Tab, image: Uint8Array, options: ProofImageOptions & Pick<ImageOptions, 'quality'>): Promise<Uint8Array> {
  const table = proofTable(options.profile)
  const decoded = await decode(tab, image)
  return encode(tab, decoded.width, decoded.height, proofRgba(table, decoded.rgba), options.format ?? 'png', options.quality)
}

// Proofing captures PNG so Chromium's pixels are not quantized before the table, then encodes once at the requested quality.
export function proofCaptureOptions(options: ImageOptions): Pick<ImageOptions, 'format' | 'quality' | 'limits'> {
  const capture = { format: options.format, quality: options.quality, limits: options.limits }
  return options.proof ? { ...capture, format: 'png' } : capture
}

export async function proofCapturedImage(tab: Tab, image: Uint8Array, options: ImageOptions): Promise<Uint8Array> {
  if (!options.proof) return image
  return proofRasterImage(tab, image, { profile: options.proof.profile, format: options.format, quality: options.quality })
}
