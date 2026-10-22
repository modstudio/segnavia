import { rewriteEffectsPdf } from './effects/adapter.ts'
import { RenderRefusedError } from './errors.ts'
import type { RenderLimits, RenderOptions } from './options.ts'
import { loadPdf } from './pdf-load.ts'
import { rewritePressPdf } from './press/adapter.ts'
import { assertNeutralTolerance, DEFAULT_NEUTRAL_TOLERANCE } from './press/color-policy.ts'
import type { JpegDecoder } from './press/image.ts'

async function sheets(pdf: Uint8Array): Promise<number> {
  return (await loadPdf(pdf)).getPageCount()
}

export async function enforce(pdf: Uint8Array, limits: RenderLimits | undefined): Promise<Uint8Array> {
  if (limits?.maxBytes !== undefined && pdf.byteLength > limits.maxBytes) {
    throw new RenderRefusedError(`The PDF is ${pdf.byteLength} bytes; the limit is ${limits.maxBytes}.`)
  }
  if (limits?.maxSheets !== undefined) {
    const count = await sheets(pdf)
    if (count > limits.maxSheets) throw new RenderRefusedError(`The PDF has ${count} sheets; the limit is ${limits.maxSheets}.`)
  }
  return pdf
}

export async function finishPdf(pdf: Uint8Array, options: Pick<RenderOptions, 'effects' | 'limits' | 'press'>, decodeJpeg?: JpegDecoder): Promise<Uint8Array> {
  if (options.limits?.maxBytes !== undefined && pdf.byteLength > options.limits.maxBytes)
    throw new RenderRefusedError(`The PDF is ${pdf.byteLength} bytes; the limit is ${options.limits.maxBytes}.`)
  let output = pdf
  if (options.effects !== false) {
    const rewritten = await rewriteEffectsPdf(output)
    output = rewritten.bytes
    options.effects?.report?.(rewritten.report)
  }
  if (options.press) {
    const neutralTolerance = options.press.neutralTolerance ?? DEFAULT_NEUTRAL_TOLERANCE
    assertNeutralTolerance(neutralTolerance)
    const converted = await rewritePressPdf(output, options.press.profile, neutralTolerance, decodeJpeg)
    output = converted.bytes
    options.press.report?.(converted.report)
  }
  return enforce(output, options.limits)
}
