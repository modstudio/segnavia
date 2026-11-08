import { Plan } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { parseRenderOptions } from './options.ts'
import type { BookPdfOptions } from './renderer.ts'

export function parseBookPdfOptions(options: BookPdfOptions): BookPdfOptions {
  const parsed = parseRenderOptions(options)
  if (parsed.plan === undefined) return parsed
  try {
    return { ...parsed, plan: Plan.parse(parsed.plan, { limits: parsed.limits }) }
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}
