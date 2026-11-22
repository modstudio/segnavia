import { expect, test } from 'bun:test'
import { PREFLIGHT_PRESETS } from '@segnavia/format'
import { MESSAGE } from './bridge.ts'
import { dispatchFontFailures, dispatchPreflight, messageFromFrames } from './bridge-message.ts'

const messageTypes = MESSAGE

function soundMessage(data: unknown, source: object, frameSource: object = source) {
  const frame = { contentWindow: frameSource } as HTMLIFrameElement
  return messageFromFrames({ data, source } as MessageEvent, frame, messageTypes, [], 1024, PREFLIGHT_PRESETS.default)
}

test('accepts only an exact bounded sound-play message from the named frame', () => {
  const source = {}
  expect(soundMessage({ type: MESSAGE.soundPlay, placement: 'x'.repeat(256) }, source)).toEqual({ type: MESSAGE.soundPlay, placement: 'x'.repeat(256) })
  expect(soundMessage({ type: MESSAGE.soundPlay, placement: 'x'.repeat(257) }, source)).toBeNull()
  expect(soundMessage({ type: MESSAGE.soundPlay, placement: 0 }, source)).toBeNull()
  expect(soundMessage({ type: MESSAGE.soundPlay }, source)).toBeNull()
  expect(soundMessage({ type: MESSAGE.soundPlay, placement: '0', extra: true }, source)).toBeNull()
  expect(soundMessage({ type: MESSAGE.soundPlay, placement: '0' }, source, {})).toBeNull()
})

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
    facts: { pageCount: 0, pages: [], fits: [], regions: [] },
    coverage: { measured: 0, total: 0, slots: { measured: 0, total: 0 } },
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
