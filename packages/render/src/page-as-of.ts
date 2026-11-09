import type { Page } from '@segnavia/format'
import { resolveDayContextsFor } from '@segnavia/html'
import type { PageRenderOptions } from './options.ts'

export async function resolveRenderDayContexts(pages: readonly Page[], options: PageRenderOptions, signal: AbortSignal) {
  return resolveDayContextsFor(pages, options, options.slots, signal)
}
