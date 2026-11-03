import { expect, test } from 'bun:test'
import { HEADLESS_ELEMENT_NAMES } from './headless-elements.ts'
import { ELEMENT_PROPERTIES, ELEMENT_PROPERTY_DESCRIPTORS, upgradeProperties } from './element-properties.ts'
import { STYLED_ELEMENT_NAMES } from './styled-elements.ts'

class ValueElement {
  private current = 0

  get value(): number {
    return this.current
  }

  set value(value: number) {
    if (value < 0) throw new RangeError('The value must not be negative.')
    this.current = value
  }
}

test('owned properties replay through their accessors', () => {
  const element = new ValueElement()
  Object.defineProperty(element, 'value', { configurable: true, value: 4, writable: true })
  upgradeProperties(element, ['value'])
  expect(element.value).toBe(4)
  expect(Object.hasOwn(element, 'value')).toBeFalse()
})

test('replayed properties receive the same refusal as a late assignment', () => {
  const late = new ValueElement()
  expect(() => {
    late.value = -1
  }).toThrow('The value must not be negative.')

  const early = new ValueElement()
  Object.defineProperty(early, 'value', { configurable: true, value: -1, writable: true })
  expect(() => upgradeProperties(early, ['value'])).toThrow('The value must not be negative.')
})

test('unlisted owned properties stay untouched', () => {
  const element = Object.assign(new ValueElement(), { other: 3 })
  upgradeProperties(element, ['value'])
  expect(element.other).toBe(3)
  expect(Object.hasOwn(element, 'other')).toBeTrue()
})

test('the table covers every public frame element and safe event name', () => {
  const tags = new Set(ELEMENT_PROPERTY_DESCRIPTORS.map(({ tag }) => tag))
  for (const tag of [...HEADLESS_ELEMENT_NAMES, ...STYLED_ELEMENT_NAMES, 'segnavia-item-settings']) expect(tags.has(tag)).toBeTrue()
  for (const { events } of ELEMENT_PROPERTY_DESCRIPTORS) {
    for (const name of Object.keys(events)) expect(name).not.toMatch(/(?:once|passive|capture)$/i)
  }
  expect(ELEMENT_PROPERTIES.board.properties).toContain('selected')
})
