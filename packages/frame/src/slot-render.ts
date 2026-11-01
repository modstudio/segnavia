import type { SlotDeclaration, SlotsOptions } from '@segnavia/format'
import type { ResolvePlacement } from '@segnavia/html'
import {
  collectSlotPrintCopies,
  hasSlotWork,
  type PreparedSlots,
  prepareSlotCollection as prepareHtmlSlotCollection,
  prepareSlots as prepareHtmlSlots,
  RequiredSlotsRefusedError,
  requiredSlotRefusal,
  SlotFillRefusedError,
  SlotFillsConflictError,
  SlotFillsRefusedError,
  type SlotPrintOptions,
  safeImageSource,
  slotFillRefusal,
  UnmeasuredSlotsRefusedError,
  unmeasuredSlotRefusal,
} from '@segnavia/html'

export type { PreparedSlots, SlotPrintOptions }

export function slotAssetFrom(resolve: ResolvePlacement): NonNullable<SlotsOptions['resolveAsset']> {
  return async (address, { signal }) => {
    const answer = await resolve({ kind: 'media', address }, { purpose: 'screen', width: 1, signal })
    if (answer?.kind !== 'media' || !safeImageSource(answer.src)) throw new Error(`The media at ${address} could not be resolved for an image slot.`)
    return answer.src
  }
}
export {
  collectSlotPrintCopies,
  hasSlotWork,
  RequiredSlotsRefusedError,
  requiredSlotRefusal,
  SlotFillRefusedError,
  SlotFillsConflictError,
  SlotFillsRefusedError,
  slotFillRefusal,
  UnmeasuredSlotsRefusedError,
  unmeasuredSlotRefusal,
}

export const EMPTY_SLOTS: PreparedSlots = {
  declarations: [],
  report: { fill: null, slots: {}, origins: {} },
  marked: new Map(),
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
