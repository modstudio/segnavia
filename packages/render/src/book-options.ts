import { Plan } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { parseComposedRenderOptions } from './options.ts'
import type { BookPdfOptions, ParsedBookPdfOptions } from './renderer.ts'

export function parseBookPdfOptions(options: BookPdfOptions): ParsedBookPdfOptions {
  const parsed = parseComposedRenderOptions(options)
  if (parsed.plan === undefined) return parsed
  try {
    return { ...parsed, plan: Plan.parse(parsed.plan, { limits: parsed.limits }) }
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}
