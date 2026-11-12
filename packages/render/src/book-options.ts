import { Plan } from '@segnavia/format'
import { parseAsOfInputs } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { parseComposedRenderOptions, parseRenderOptions } from './options.ts'
import { parsePdfOptions } from './protection-options.ts'
import type { BookPdfOptions, BookPlanOptions, ParsedBookPdfOptions } from './renderer.ts'

export function parseBookPdfOptions(options: BookPdfOptions): ParsedBookPdfOptions {
  const parsed = parseAsOfInputs(parsePdfOptions(parseComposedRenderOptions(options)))
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
