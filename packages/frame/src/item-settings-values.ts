import { type Fill, type FillValues, resolveSlotValue, type SlotDeclaration, type SlotReport, type SlotState, type SlotValue } from '@segnavia/format'

export type SlotWarning = 'missing' | 'overflowed' | 'shrunk'

export interface SlotFieldView {
  key: string
  label: string
  type: SlotDeclaration['type']
  required: boolean
  value: SlotValue | undefined
  text: string
  readOnly: boolean
  canOverride: boolean
  canUseSource: boolean
  canDesignOnly: boolean
  designOnly: boolean
  state: SlotState | undefined
  warnings: SlotWarning[]
}

function layeredValue(slot: SlotDeclaration, overrides: FillValues, fill: Fill | undefined, source: Fill | undefined) {
  return resolveSlotValue([
    { name: 'design', value: overrides[slot.key] },
    { name: 'hand', value: fill?.values[slot.key] },
    { name: 'source', value: source?.values[slot.key] },
    { name: 'placeholder', value: slot.placeholder },
  ])
}

function displayText(value: SlotValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

function isFilledState(state: SlotState | undefined): boolean {
  return state === 'filled' || state === 'fit' || state === 'shrunk'
}

// Before the first report arrives, a slot counts as filled when a layer supplies a value.
export function slotWarnings(slot: SlotDeclaration, state: SlotState | undefined, hasValue = false): SlotWarning[] {
  const warnings: SlotWarning[] = []
  const filled = state === undefined ? hasValue : isFilledState(state)
  if (slot.required && !filled) warnings.push('missing')
  if (state === 'overflowed') warnings.push('overflowed')
  if (state === 'shrunk') warnings.push('shrunk')
  return warnings
}

export function slotFieldView(
  slot: SlotDeclaration,
  overrides: FillValues,
  fill: Fill | undefined,
  source: Fill | undefined,
  report: SlotReport | undefined,
  canDesignOnly = false,
): SlotFieldView {
  const layered = layeredValue(slot, overrides, fill, source)
  const displayedFill = fill?.id ?? source?.id ?? null
  const currentReport = report?.fill === displayedFill ? report : undefined
  const state = currentReport !== undefined && Object.hasOwn(currentReport.slots, slot.key) ? currentReport.slots[slot.key] : undefined
  const origin = currentReport?.origins[slot.key] ?? layered.origin
  const value =
    origin === 'design'
      ? (overrides[slot.key] ?? layered.value)
      : origin === 'source'
        ? (source?.values[slot.key] ?? layered.value)
        : origin === 'hand'
          ? (fill?.values[slot.key] ?? layered.value)
          : layered.value
  const sourceHasValue = source?.values[slot.key] !== undefined && source.values[slot.key] !== ''
  const designOnly = overrides[slot.key] !== undefined && overrides[slot.key] !== ''
  const readOnly = origin === 'source'
  return {
    key: slot.key,
    label: slot.label,
    type: slot.type,
    required: slot.required,
    value,
    text: displayText(value),
    readOnly,
    canOverride: readOnly && fill !== undefined,
    canUseSource: origin === 'hand' && sourceHasValue && fill !== undefined,
    canDesignOnly,
    designOnly,
    state,
    warnings: slotWarnings(slot, state, layered.value !== undefined),
  }
}

export function overrideValue(source: Fill | undefined, key: string): SlotValue | undefined {
  const value = source?.values[key]
  return value === undefined || value === '' ? undefined : value
}
