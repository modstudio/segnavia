import type { Page } from '@segnavia/format'
import { resolveDocumentDayContexts } from '@segnavia/html'
import type { RenderOptions } from './options.ts'

export async function resolveRenderDayContexts(pages: readonly Page[], options: RenderOptions, signal: AbortSignal) {
  const contexts = await resolveDocumentDayContexts(pages, {
    moment: options.moment ?? Date.now(),
    hostZone: options.asOf?.zone,
    anchors: options.anchors,
    slots: options.slots,
    refuseMixedResolvedDays: true,
    signal,
  })
  options.asOf?.report?.(contexts.days)
  return contexts
}
