import type { AnchorSource, AsOf, AsOfDay, SlotDeclaration, SlotsOptions, Zone } from '@segnavia/format'
import { fillAsOfBindings, resolveDayContextsFor } from '@segnavia/html'
import { type PreparedSlots, prepareSlots } from './slot-render.ts'

export interface EstablishedSurfaceDay {
  day: AsOfDay
  slots: SlotsOptions
}

export interface CapturedAsOfLoad {
  hostMoment?: number
  hostZone?: Zone
  anchors?: AnchorSource
}

export async function resolveSurfaceDay(
  record: { asOf?: AsOf },
  inputs: CapturedAsOfLoad,
  slots: SlotsOptions | undefined,
  signal: AbortSignal,
): Promise<EstablishedSurfaceDay> {
  const contexts = await resolveDayContextsFor(
    [record],
    {
      moment: inputs.hostMoment,
      anchors: inputs.anchors,
      asOf: inputs.hostZone === undefined ? undefined : { zone: inputs.hostZone },
    },
    slots,
    signal,
  )
  return contexts.pages[0] as EstablishedSurfaceDay
}

export async function prepareSurfaceSlots(
  declarations: readonly SlotDeclaration[] | undefined,
  established: EstablishedSurfaceDay,
  signal: AbortSignal,
): Promise<PreparedSlots> {
  const prepared = await prepareSlots(declarations, established.slots, signal)
  return {
    ...prepared,
    apply: (html) => prepared.apply(fillAsOfBindings(html, established.day)),
  }
}
