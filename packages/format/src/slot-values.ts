import type { SlotValue } from './slots.ts'

export interface SlotValueLayer<Name extends string = string> {
  name: Name
  value: SlotValue | undefined
}

export function resolveSlotValue<const Name extends string>(layers: readonly SlotValueLayer<Name>[]): { value?: SlotValue; origin?: Name } {
  for (const layer of layers) {
    if (layer.value !== undefined && layer.value !== '') return { value: layer.value, origin: layer.name }
  }
  return {}
}
