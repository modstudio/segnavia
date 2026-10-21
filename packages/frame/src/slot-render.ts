import type { SlotDeclaration, SlotsOptions } from '@segnavia/format'
import {
  hasSlotWork,
  type PreparedSlots,
  prepareSlotCollection as prepareHtmlSlotCollection,
  prepareSlots as prepareHtmlSlots,
  RequiredSlotsRefusedError,
  requiredSlotRefusal,
  SlotFillRefusedError,
  slotFillRefusal,
} from '@segnavia/html'

export type { PreparedSlots }
export { hasSlotWork, RequiredSlotsRefusedError, requiredSlotRefusal, SlotFillRefusedError, slotFillRefusal }

export const EMPTY_SLOTS: PreparedSlots = {
  declarations: [],
  report: { fill: null, slots: {} },
  apply: (html) => html,
  mergeFit: () => EMPTY_SLOTS.report,
}

export function prepareSlots(item: readonly SlotDeclaration[] | undefined, options: SlotsOptions | undefined, signal?: AbortSignal): Promise<PreparedSlots> {
  return prepareHtmlSlots(item, options, signal)
}

export function prepareSlotCollection(
  items: ReadonlyArray<readonly SlotDeclaration[] | undefined>,
  options: SlotsOptions | undefined,
  signal?: AbortSignal,
): Promise<PreparedSlots> {
  return prepareHtmlSlotCollection(items, options, signal)
}

export function slotHtml(html: string, prepared: PreparedSlots | undefined): string {
  return prepared ? prepared.apply(html) : html
}
