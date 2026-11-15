import { parseLimits } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { parsePdfOptions } from './protection-options.ts'
import { refuseUnknownOptions } from './render-option-keys.ts'
import type { StampPdfOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

export function parseStampPdfOptions(options: StampPdfOptions): StampPdfOptions {
  refuseUnknownOptions('stampPdf', options)
  if (options.watermark === undefined && options.protection === undefined) {
    throw new RenderRefusedError('stampPdf needs watermark or protection; pass at least one of options.watermark and options.protection to clear this refusal.')
  }
  if (options.boundMs !== undefined && (!Number.isFinite(options.boundMs) || options.boundMs < 0)) {
    throw new RenderRefusedError('stampPdf boundMs needs to be a non-negative finite number; pass a valid boundMs to clear this refusal.')
  }
  if (options.fonts !== undefined && !Array.isArray(options.fonts)) {
    throw new RenderRefusedError('stampPdf fonts needs to be an array; pass an array of font faces or omit fonts to clear this refusal.')
  }
  const parsed = parsePdfOptions({ ...options, limits: parseLimits(options.limits, 'host') }, 'stampPdf')
  return parseWatermarkOption(parsed, 'stampPdf')
}
