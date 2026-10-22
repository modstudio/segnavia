import type { Fill, SlotDeclaration, SlotReport, SlotState, SlotValue } from '@segnavia/format'

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
  warnings: SlotWarning[]
}

function layeredValue(fill: Fill | undefined, source: Fill | undefined, key: string): { value?: SlotValue; origin?: 'hand' | 'source' } {
  const hand = fill?.values[key]
  if (hand !== undefined && hand !== '') return { value: hand, origin: 'hand' }
  const fromSource = source?.values[key]
  if (fromSource !== undefined && fromSource !== '') return { value: fromSource, origin: 'source' }
  return {}
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

export function slotFieldView(slot: SlotDeclaration, fill: Fill | undefined, source: Fill | undefined, report: SlotReport | undefined): SlotFieldView {
  const layered = layeredValue(fill, source, slot.key)
  const origin = report?.origins[slot.key] ?? layered.origin
  const value =
    origin === 'source' ? (source?.values[slot.key] ?? layered.value) : origin === 'hand' ? (fill?.values[slot.key] ?? layered.value) : layered.value
  const sourceHasValue = source?.values[slot.key] !== undefined && source.values[slot.key] !== ''
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
    warnings: slotWarnings(slot, report?.slots[slot.key], layered.value !== undefined),
  }
}

export function overrideValue(source: Fill | undefined, key: string): SlotValue | undefined {
  const value = source?.values[key]
  return value === undefined || value === '' ? undefined : value
}
