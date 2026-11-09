import { expect, test } from 'bun:test'
import { resolveSlotValue } from './slot-values.ts'
import type { SlotValue } from './slots.ts'

test('resolves the first non-empty design, fill, source or placeholder layer', () => {
  const layers = (design?: SlotValue, fill?: SlotValue, source?: SlotValue, placeholder?: SlotValue) =>
    resolveSlotValue([
      { name: 'design', value: design },
      { name: 'fill', value: fill },
      { name: 'source', value: source },
      { name: 'placeholder', value: placeholder },
    ])

  expect(layers('Design', 'Fill', 'Source', 'Placeholder')).toEqual({ value: 'Design', origin: 'design' })
  expect(layers('', 'Fill', 'Source', 'Placeholder')).toEqual({ value: 'Fill', origin: 'fill' })
  expect(layers(undefined, '', 'Source', 'Placeholder')).toEqual({ value: 'Source', origin: 'source' })
  expect(layers(undefined, undefined, '', 'Placeholder')).toEqual({ value: 'Placeholder', origin: 'placeholder' })
  expect(layers()).toEqual({})
})
