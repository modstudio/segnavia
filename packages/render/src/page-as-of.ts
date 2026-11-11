import type { AsOf } from '@segnavia/format'
import { type AsOfInputs, type EstablishedPageDay, resolveDayContextsFor } from '@segnavia/html'
import type { RenderOptions } from './options.ts'

export async function resolveRenderDayContexts(records: readonly { asOf?: AsOf }[], options: RenderOptions & AsOfInputs, signal: AbortSignal) {
  return resolveDayContextsFor(records, options, options.slots, signal)
}

export async function resolveRenderDayContext(record: { asOf?: AsOf }, options: RenderOptions & AsOfInputs, signal: AbortSignal): Promise<EstablishedPageDay> {
  const contexts = await resolveRenderDayContexts([record], options, signal)
  const established = contexts.pages[0]
  if (!established) throw new RangeError('A render day could not be established for the record.')
  return established
}
