import { expect, test } from 'bun:test'
import { MESSAGE } from './bridge.ts'
import { type DeckState, initialDeckState } from './controller-types.ts'
import { postFrameCue, postStageCue } from './stage-cue.ts'

test('cue messages are posted only to bridged url frames', () => {
  const messages: unknown[] = []
  const frame = { contentWindow: { postMessage: (message: unknown) => messages.push(message) } } as unknown as HTMLIFrameElement
  expect(postFrameCue(frame, { kind: 'url', src: 'served.html', bridge: true }, [0, 2])).toBe(true)
  expect(postFrameCue(frame, { kind: 'url', src: 'plain.html' }, [1])).toBe(false)
  expect(postFrameCue(frame, { kind: 'html', html: '<p>x</p>' }, null)).toBe(false)
  expect(messages).toEqual([{ type: MESSAGE.cue, annotations: [0, 2] }])
})

test('stage cue delivery deduplicates changes and can repeat at readiness', () => {
  const messages: unknown[] = []
  const frame = { contentWindow: { postMessage: (message: unknown) => messages.push(message) } } as unknown as HTMLIFrameElement
  const pool = { frameForSlide: () => frame }
  const sent = new WeakMap<HTMLIFrameElement, string>()
  const state: DeckState = {
    ...initialDeckState(),
    slide: { id: 'served', content: { kind: 'url', src: 'served.html', annotationCount: 2 } },
    content: { kind: 'url', src: 'served.html', annotationCount: 2, bridge: true as const },
    shown: [0],
  }
  postStageCue(pool, sent, state)
  postStageCue(pool, sent, state)
  postStageCue(pool, sent, state, true)
  expect(messages).toEqual([
    { type: MESSAGE.cue, annotations: [0] },
    { type: MESSAGE.cue, annotations: [0] },
  ])
})
