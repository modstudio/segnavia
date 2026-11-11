import type { AsOf, SlotDeclaration, SlotsOptions } from '@segnavia/format'
import { type EstablishedPageDay, fillAsOfBindings, resolveDayContextsFor } from '@segnavia/html'
import type { captureAsOfLoad } from './as-of-element.ts'
import { type PreparedSlots, prepareSlots } from './slot-render.ts'

export async function resolveSurfaceDay(
  record: { asOf?: AsOf },
  inputs: ReturnType<typeof captureAsOfLoad>,
  slots: SlotsOptions | undefined,
  signal: AbortSignal,
): Promise<EstablishedPageDay> {
  const contexts = await resolveDayContextsFor(
    [record],
    {
      moment: inputs.moment,
      anchors: inputs.anchors,
      asOf: inputs.hostZone === undefined ? undefined : { zone: inputs.hostZone },
    },
    slots,
    signal,
  )
  return contexts.pages[0] as EstablishedPageDay
}

export async function prepareSurfaceSlots(
  declarations: readonly SlotDeclaration[] | undefined,
  established: EstablishedPageDay,
  signal: AbortSignal,
): Promise<PreparedSlots> {
  const prepared = await prepareSlots(declarations, established.slots, signal)
  return {
    ...prepared,
    apply: (html) => prepared.apply(fillAsOfBindings(html, established.day)),
  }
}
