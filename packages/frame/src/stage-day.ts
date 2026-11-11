import type { AsOf, Deck, SlotDeclaration, SlotsOptions } from '@segnavia/format'
import { type EstablishedPageDay, hasAsOfBinding } from '@segnavia/html'
import type { captureAsOfLoad } from './as-of-element.ts'
import { prepareSurfaceSlots, resolveSurfaceDay } from './as-of-slots.ts'
import { hasSlotWork, type PreparedSlots } from './slot-render.ts'

export function stageDayChangesFrames(deck: Deck, slots: SlotsOptions | undefined, refused: boolean): boolean {
  return (
    (!refused && hasSlotWork(deck.slots, slots)) ||
    deck.slides.some((slide) => 'kind' in slide.content && slide.content.kind === 'html' && hasAsOfBinding(slide.content.html))
  )
}

export async function prepareStageDay(
  record: { asOf?: AsOf },
  inputs: ReturnType<typeof captureAsOfLoad>,
  declarations: readonly SlotDeclaration[] | undefined,
  slots: SlotsOptions | undefined,
  signal: AbortSignal,
): Promise<{ established: EstablishedPageDay; resolved: PreparedSlots }> {
  const established = await resolveSurfaceDay(record, inputs, slots, signal)
  return { established, resolved: await prepareSurfaceSlots(declarations, established, signal) }
}
