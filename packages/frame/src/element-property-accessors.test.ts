import { expect, test } from 'bun:test'
import { defineElementPropertyAccessors } from './element-property-accessors.ts'

test('a generated property write calls its declared change callback', () => {
  class Element {}
  const changes: Array<{ element: object; property: string }> = []
  defineElementPropertyAccessors(
    Element.prototype,
    () => ({ value: 0 }),
    (element, property) => changes.push({ element, property }),
  )
  const element = new Element() as Element & { value: number }

  element.value = 3

  expect(changes).toEqual([{ element, property: 'value' }])
})
