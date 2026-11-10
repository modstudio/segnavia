import type { Page } from '@segnavia/format'
import { type AsOfInputs, resolveDayContextsFor } from '@segnavia/html'
import type { RenderOptions } from './options.ts'

export async function resolveRenderDayContexts(pages: readonly Page[], options: RenderOptions & AsOfInputs, signal: AbortSignal) {
  return resolveDayContextsFor(pages, options, options.slots, signal)
}
