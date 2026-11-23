import { AS_OF_SLOT_DECLARATIONS, type SlotDeclaration, type SlotsOptions } from '@segnavia/format'
import {
  classifyMediaAnswer,
  collectSlotPrintCopies,
  fillsSlotValues,
  hasSlotWork,
  type PreparedSlots,
  prepareSlotCollection as prepareHtmlSlotCollection,
  prepareSlots as prepareHtmlSlots,
  RequiredSlotsRefusedError,
  type ResolvePlacement,
  refuseUndefinedSlotPaths,
  requiredSlotRefusal,
  SlotFillRefusedError,
  SlotFillsConflictError,
  SlotFillsRefusedError,
  type SlotPrintOptions,
  slotFillRefusal,
  UnmeasuredSlotsRefusedError,
  unmeasuredSlotRefusal,
} from '@segnavia/html'

export type { PreparedSlots, SlotPrintOptions }

export function slotAssetFrom<R extends { kind: string }>(
  resolve: ResolvePlacement<R>,
  context: { purpose?: 'screen' | 'print'; width?: number } = {},
): NonNullable<SlotsOptions['resolveAsset']> {
  return async (address, { signal }) => {
    const answer = await resolve(
      { kind: 'media', address },
      { purpose: context.purpose ?? 'screen', ...(context.width === undefined ? {} : { width: context.width }), signal },
    )
    const classified = classifyMediaAnswer({ answer })
    if (classified.status !== 'ok') throw new Error(`The media at ${address} could not be resolved for an image slot.`)
    return classified.value.src
  }
}
export {
  collectSlotPrintCopies,
  fillsSlotValues,
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
  frames: [],
  apply: (html) =>
    refuseUndefinedSlotPaths(
      html,
      AS_OF_SLOT_DECLARATIONS.map((slot) => slot.key),
    ),
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

export function slotHtml(html: string, prepared: PreparedSlots | undefined, declarations: readonly SlotDeclaration[] = []): string {
  return prepared && prepared !== EMPTY_SLOTS
    ? prepared.apply(html)
    : refuseUndefinedSlotPaths(html, [...declarations.map((slot) => slot.key), ...AS_OF_SLOT_DECLARATIONS.map((slot) => slot.key)])
}
