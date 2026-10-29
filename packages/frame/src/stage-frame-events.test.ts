import { expect, test } from 'bun:test'
import { type StageFrameDetail, stageFrameEvents } from './stage-frame-events.ts'

test('stage frame events carry the exact resolved content', () => {
  const stage = new EventTarget()
  const frames = stageFrameEvents(stage)
  const content = { kind: 'url' as const, src: 'resolved.html' }
  const received: Array<{ name: string; detail: StageFrameDetail; bubbles: boolean }> = []
  for (const name of ['segnavia-frame-mount', 'segnavia-frame-release']) {
    stage.addEventListener(name, (event) => {
      const frameEvent = event as CustomEvent<StageFrameDetail>
      received.push({ name, detail: frameEvent.detail, bubbles: frameEvent.bubbles })
    })
  }

  frames.mounted('shown', content)
  frames.released('shown', content)

  expect(received.map(({ name }) => name)).toEqual(['segnavia-frame-mount', 'segnavia-frame-release'])
  expect(received.every(({ detail }) => detail.slideId === 'shown' && detail.content === content)).toBeTrue()
  expect(received.every(({ bubbles }) => !bubbles)).toBeTrue()
})
