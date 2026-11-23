import { expect, test } from 'bun:test'
import type { FontFailure } from '@segnavia/format'
import { MESSAGE } from './bridge.ts'
import { StageFontFailures } from './stage-font-failures.ts'
import { handleStageMessage } from './stage-message.ts'

test('a stage reports one bounded frame failure and ignores repeats and non-pool sources', () => {
  const source = {}
  const frame = { contentWindow: source } as HTMLIFrameElement
  const target = new EventTarget()
  const tracker = new StageFontFailures()
  const received: FontFailure[][] = []
  target.addEventListener('fontfailure', (event) => received.push((event as CustomEvent<{ failures: FontFailure[] }>).detail.failures))
  const pool = {
    frames: () => [frame],
    markReady() {},
    activeFrame: () => frame,
    slideIdFor: () => 'slide',
    contentFor: () => undefined,
  }
  const failure = { font: 'body', family: 'Body', weight: 400, style: 'normal', reason: 'unloaded' as const }
  const send = (eventSource: object, failures: unknown) =>
    handleStageMessage(
      target as HTMLElement,
      pool,
      undefined,
      null,
      () => {},
      () => {},
      { source: eventSource, data: { type: MESSAGE.fontFailures, failures } } as MessageEvent,
      (bounded) => tracker.report(target, bounded),
    )

  send(source, [failure])
  send(source, [failure])
  send({}, [{ ...failure, family: 'Other' }])

  expect(received).toEqual([[failure]])
})
