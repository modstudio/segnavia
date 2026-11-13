import { type AsOf, dayWithHostMoment, resolveAsOfDay, resolveDocumentDayResult, type SlotDeclaration, type SlotsOptions } from '@segnavia/format'
import { type EstablishedPageDay, fillAsOfBindings, resolveDayContextsFor, slotsForDay } from '@segnavia/html'
import { asOfContextInputs, type captureAsOfLoad } from './as-of-element.ts'
import { type PreparedSlots, prepareSlots } from './slot-render.ts'

export async function resolveSurfaceDay(
  record: { asOf?: AsOf },
  inputs: ReturnType<typeof captureAsOfLoad>,
  slots: SlotsOptions | undefined,
  signal: AbortSignal,
): Promise<EstablishedPageDay> {
  const contexts = await resolveDayContextsFor([record], asOfContextInputs(inputs), slots, signal)
  return contexts.pages[0] as EstablishedPageDay
}

export function resolvePageDayLoad(
  record: { asOf?: AsOf },
  inputs: ReturnType<typeof captureAsOfLoad>,
  slots: SlotsOptions | undefined,
  signal: AbortSignal,
): EstablishedPageDay | Promise<EstablishedPageDay> {
  const facts = { ...inputs, signal }
  const policy = resolveAsOfDay(record.asOf, facts)
  if (policy.kind === 'day' && !slots?.resolve) {
    return {
      day: dayWithHostMoment(policy.day, facts.hostMoment),
      slots: { ...slots, resolve: undefined, source: slots?.source },
    }
  }
  return resolveDocumentDayResult(policy, facts).then(async (day) => ({ day, slots: await slotsForDay(slots, day, signal) }))
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
