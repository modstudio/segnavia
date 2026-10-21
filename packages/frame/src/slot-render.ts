import type { SlotDeclaration, SlotsOptions } from '@segnavia/format'
import { type PreparedSlots, prepareSlotCollection as prepareHtmlSlotCollection, prepareSlots as prepareHtmlSlots } from '@segnavia/html'

export type { PreparedSlots }

export const EMPTY_SLOTS: PreparedSlots = { report: { fill: null, slots: {} }, apply: (html) => html }

export function hasSlotWork(item: readonly SlotDeclaration[] | undefined, options: SlotsOptions | undefined): boolean {
  return Boolean(item?.length || options?.declarations?.length || options?.fill || options?.resolveAsset || options?.report)
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
