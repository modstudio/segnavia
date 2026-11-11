import { expect, test } from 'bun:test'
import { captureAsOfLoad, defineAsOfPropertyAccessors } from './as-of-element.ts'

class Host {
  changes = 0
  asOfInputsChanged() {
    this.changes += 1
  }
}

defineAsOfPropertyAccessors(Host.prototype)

test('captures a host moment separately from the clock fallback', () => {
  const clockOnly = captureAsOfLoad(new Host())
  expect(clockOnly.moment).toBeNumber()
  expect(clockOnly).not.toHaveProperty('hostMoment')

  const host = new Host() as Host & { moment?: number }
  host.moment = 1234
  expect(captureAsOfLoad(host)).toMatchObject({ moment: 1234, hostMoment: 1234 })
})
