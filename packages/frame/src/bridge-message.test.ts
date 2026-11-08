import { expect, test } from 'bun:test'
import { dispatchFontFailures } from './bridge-message.ts'

test('dispatches the shared bubbling and composed fontfailure event', () => {
  const target = new EventTarget()
  const failures = [{ font: 'body', family: 'Body', reason: 'unloaded' as const }]
  let received: CustomEvent | undefined
  target.addEventListener('fontfailure', (event) => {
    received = event as CustomEvent
  })
  dispatchFontFailures(target, { type: 'segnavia:font-failures', failures })
  expect(received?.type).toBe('fontfailure')
  expect(received?.detail).toEqual({ failures })
  expect(received?.bubbles).toBe(true)
  expect(received?.composed).toBe(true)
})
