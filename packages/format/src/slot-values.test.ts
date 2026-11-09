import { expect, test } from 'bun:test'
import { hasSlotValue, resolveSlotValue } from './slot-values.ts'
import type { SlotValue } from './slots.ts'

test('resolves the first non-empty design, hand or source layer', () => {
  const layers = (design?: SlotValue, hand?: SlotValue, source?: SlotValue) =>
    resolveSlotValue([
      { name: 'design', value: design },
      { name: 'hand', value: hand },
      { name: 'source', value: source },
    ])

  expect(layers('Design', 'Fill', 'Source')).toEqual({ value: 'Design', origin: 'design' })
  expect(layers('', 'Fill', 'Source')).toEqual({ value: 'Fill', origin: 'hand' })
  expect(layers(undefined, '', 'Source')).toEqual({ value: 'Source', origin: 'source' })
  expect(layers()).toEqual({})
})

test('a slot value is present unless it is undefined or an empty string', () => {
  expect(hasSlotValue(undefined)).toBeFalse()
  expect(hasSlotValue('')).toBeFalse()
  expect(hasSlotValue('Value')).toBeTrue()
  expect(hasSlotValue({ asset: 'asset-id' })).toBeTrue()
})
