import { Plan } from '@segnavia/format'
import { parseAsOfInputs } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { parseComposedRenderOptions, parseRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import { refuseUnknownOptions } from './render-option-keys.ts'
import type { BookPdfOptions, BookPlanOptions, ParsedBookPdfOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

export function parseBookPdfOptions(options: BookPdfOptions): ParsedBookPdfOptions {
  refuseUnknownOptions('bookPdf', options)
  const base = parseAsOfInputs(parsePdfOptions(parseComposedRenderOptions(options), 'bookPdf'))
  const parsed = parseWatermarkOption(base, 'bookPdf')
  if (parsed.plan === undefined) return parsed
  try {
    return { ...parsed, plan: Plan.parse(parsed.plan, { limits: parsed.limits }) }
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}

export function parseBookPlanOptions(options: BookPlanOptions) {
  refuseUnknownOptions('bookPlan', options)
  return parseAsOfInputs(parseRenderOptions(options))
}
