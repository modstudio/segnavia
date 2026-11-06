import { type Limits, limitRefusal } from '@segnavia/format'
import { rewriteEffectsPdf } from './effects/adapter.ts'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './options.ts'
import { loadPdf } from './pdf-load.ts'
import { rewritePressPdf } from './press/adapter.ts'
import { assertNeutralTolerance, DEFAULT_NEUTRAL_TOLERANCE } from './press/color-policy.ts'
import type { JpegDecoder } from './press/image.ts'
import { assertPressImageOptions, DEFAULT_IMAGE_ENCODING, DEFAULT_IMAGE_QUALITY } from './press/image-options.ts'

async function sheets(pdf: Uint8Array): Promise<number> {
  return (await loadPdf(pdf)).getPageCount()
}

export async function enforce(pdf: Uint8Array, limits: Limits | undefined): Promise<Uint8Array> {
  if (limits?.bytes !== undefined && pdf.byteLength > limits.bytes) {
    throw new RenderRefusedError(limitRefusal('bytes', pdf.byteLength, limits.bytes))
  }
  if (limits?.sheets !== undefined) {
    const count = await sheets(pdf)
    if (count > limits.sheets) throw new RenderRefusedError(limitRefusal('sheets', count, limits.sheets))
  }
  return pdf
}

export async function finishPdf(pdf: Uint8Array, options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>, decodeJpeg?: JpegDecoder): Promise<Uint8Array> {
  if (options.limits?.bytes !== undefined && pdf.byteLength > options.limits.bytes)
    throw new RenderRefusedError(limitRefusal('bytes', pdf.byteLength, options.limits.bytes))
  let output = pdf
  if (options.effects !== false) {
    const rewritten = await rewriteEffectsPdf(output)
    output = rewritten.bytes
    options.effects?.report?.(rewritten.report)
  }
  if (options.press) {
    const neutralTolerance = options.press.neutralTolerance ?? DEFAULT_NEUTRAL_TOLERANCE
    assertNeutralTolerance(neutralTolerance)
    assertPressImageOptions(options.press)
    const converted = await rewritePressPdf(
      output,
      options.press.profile,
      neutralTolerance,
      decodeJpeg,
      options.press.images ?? 'keep',
      options.press.imageEncoding ?? DEFAULT_IMAGE_ENCODING,
      options.press.imageQuality ?? DEFAULT_IMAGE_QUALITY,
    )
    output = converted.bytes
    options.press.report?.(converted.report)
  }
  return enforce(output, options.limits)
}
