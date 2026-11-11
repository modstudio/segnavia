import { expect, test } from 'bun:test'
import { dispatchFontFailures, dispatchPreflight } from './bridge-message.ts'

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

test('dispatches the shared bubbling and composed preflight event', () => {
  const target = new EventTarget()
  const report = {
    status: 'clean' as const,
    issues: [],
    omitted: {},
    facts: { pageCount: 0, pages: [], fits: [] },
    coverage: { measured: 0, total: 0 },
  }
  let received: CustomEvent | undefined
  target.addEventListener('preflight', (event) => {
    received = event as CustomEvent
  })

  expect(dispatchPreflight(target, { type: 'held-preflight-type', report })).toBe(true)
  expect(received?.type).toBe('preflight')
  expect(received?.detail).toBe(report)
  expect(received?.bubbles).toBe(true)
  expect(received?.composed).toBe(true)
})
