import type { SlotDeclaration, SlotReport, SlotState } from '@segnavia/format'

export class RequiredSlotsRefusedError extends Error {
  constructor(slots: ReadonlyArray<{ key: string; state: SlotState }>) {
    super(
      `Output was refused because slots prevent printing: ${slots.map(({ key, state }) => `"${key}" (${state})`).join(', ')}. Fill required slots; for an overflowed refuse slot, shorten its value or change the slot's overflow.`,
    )
    this.name = 'RequiredSlotsRefusedError'
  }
}

/** Returns the print/render refusal for required or overflowing declarations. */
export function requiredSlotRefusal(declarations: readonly SlotDeclaration[], report: SlotReport): RequiredSlotsRefusedError | undefined {
  const refused = declarations.flatMap((slot) => {
    const state = report.slots[slot.key]
    const required = slot.required && state !== 'filled' && state !== 'fit' && state !== 'shrunk' && state !== undefined
    const overflow = slot.overflow === 'refuse' && state === 'overflowed'
    return required || overflow ? [{ key: slot.key, state }] : []
  })
  return refused.length === 0 ? undefined : new RequiredSlotsRefusedError(refused)
}

/** Merges measured fit states into filled declared slots; any other state, and any undeclared key, is left as it was. */
export function mergeSlotFitResults(
  declarations: readonly SlotDeclaration[],
  report: SlotReport,
  slots: Record<string, 'fit' | 'shrunk' | 'overflowed'>,
): SlotReport {
  const declared = new Set(declarations.map((slot) => slot.key))
  const merged = { ...report.slots }
  const rank = { fit: 0, shrunk: 1, overflowed: 2 } as const
  for (const [key, state] of Object.entries(slots)) {
    if (!declared.has(key)) continue
    const previous = merged[key]
    if (previous === 'filled') merged[key] = state
    else if ((previous === 'fit' || previous === 'shrunk' || previous === 'overflowed') && rank[state] > rank[previous]) merged[key] = state
  }
  return { ...report, slots: merged }
}
