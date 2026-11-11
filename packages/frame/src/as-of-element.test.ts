import { expect, test } from 'bun:test'
import { captureAsOfLoad, defineAsOfPropertyAccessors } from './as-of-element.ts'

class Host {
  asOfInputsChanged() {}
}

defineAsOfPropertyAccessors(Host.prototype)

test('captures a host moment separately from the clock fallback', () => {
  const clockOnly = captureAsOfLoad(new Host())
  expect(clockOnly.moment).toBeNumber()
  expect(clockOnly).not.toHaveProperty('hostMoment')
})
