import { Plan } from '@segnavia/format'
import { parseAsOfInputs } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { parseComposedRenderOptions, parseRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import type { BookPdfOptions, BookPlanOptions, ParsedBookPdfOptions } from './renderer.ts'
import { parseWatermarkOption } from './watermark-options.ts'

export function parseBookPdfOptions(options: BookPdfOptions): ParsedBookPdfOptions {
  const base = parseAsOfInputs(parsePdfOptions(parseComposedRenderOptions(options)))
  const parsed = parseWatermarkOption(base)
  if (parsed.plan === undefined) return parsed
  try {
    return { ...parsed, plan: Plan.parse(parsed.plan, { limits: parsed.limits }) }
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}

export function parseBookPlanOptions(options: BookPlanOptions) {
  return parseAsOfInputs(parseRenderOptions(options))
}
