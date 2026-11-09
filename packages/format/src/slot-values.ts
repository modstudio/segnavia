import type { SlotOrigin, SlotValue } from './slots.ts'

export interface SlotValueLayer<Name extends SlotOrigin = SlotOrigin> {
  name: Name
  value: SlotValue | undefined
}

export function hasSlotValue(value: SlotValue | undefined): value is SlotValue {
  return value !== undefined && value !== ''
}

export function resolveSlotValue<const Name extends SlotOrigin>(layers: readonly SlotValueLayer<Name>[]): { value?: SlotValue; origin?: Name } {
  for (const layer of layers) {
    if (hasSlotValue(layer.value)) return { value: layer.value, origin: layer.name }
  }
  return {}
}
