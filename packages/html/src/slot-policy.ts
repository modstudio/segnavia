import {
  isMeasuredSlotFit,
  Refusal,
  type SlotDeclaration,
  type SlotFitState,
  type SlotReport,
  type SlotState,
  unmeasuredSlotsRefusalMessage,
} from '@segnavia/format'

export class RequiredSlotsRefusedError extends Refusal {
  readonly slots: ReadonlyArray<{ key: string; state: SlotState }>

  constructor(slots: ReadonlyArray<{ key: string; state: SlotState }>) {
    super(
      'required-slots',
      `Output was refused because slots prevent printing: ${slots.map(({ key, state }) => `"${key}" (${state})`).join(', ')}. Fill required slots; for an overflowed refuse slot, shorten its value or change the slot's overflow.`,
    )
    this.name = 'RequiredSlotsRefusedError'
    this.slots = slots
  }
}

export class UnmeasuredSlotsRefusedError extends Refusal {
  readonly keys: readonly string[]

  constructor(slots: readonly string[]) {
    super('unmeasured-slots', unmeasuredSlotsRefusalMessage(slots))
    this.name = 'UnmeasuredSlotsRefusedError'
    this.keys = slots
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

/**
 * Refuses filled refuse-overflow slots that some frame marked but did not report before output. Counts are per key:
 * frames that marked it, against fit reports received, so one frame's report cannot stand in for another's.
 * A slot no frame binds has nothing to measure.
 */
export function unmeasuredSlotRefusal(
  declarations: readonly SlotDeclaration[],
  report: SlotReport,
  marked: ReadonlyMap<string, number>,
  measured: ReadonlyMap<string, number>,
): UnmeasuredSlotsRefusedError | undefined {
  const unmeasured = declarations.flatMap((slot) =>
    slot.overflow === 'refuse' && report.slots[slot.key] !== 'overflowed' && (measured.get(slot.key) ?? 0) < (marked.get(slot.key) ?? 0) ? [slot.key] : [],
  )
  return unmeasured.length === 0 ? undefined : new UnmeasuredSlotsRefusedError(unmeasured)
}

/** Merges measured fit states into filled declared slots; any other state, and any undeclared key, is left as it was. */
export function mergeSlotFitResults(declarations: readonly SlotDeclaration[], report: SlotReport, slots: Record<string, SlotFitState>): SlotReport {
  const declared = new Set(declarations.map((slot) => slot.key))
  const merged = { ...report.slots }
  const rank = { fit: 0, shrunk: 1, overflowed: 2 } as const
  for (const [key, state] of Object.entries(slots)) {
    if (!declared.has(key) || !isMeasuredSlotFit(state)) continue
    const previous = merged[key]
    if (previous === 'filled') merged[key] = state
    else if ((previous === 'fit' || previous === 'shrunk' || previous === 'overflowed') && rank[state] > rank[previous]) merged[key] = state
  }
  return { ...report, slots: merged }
}
