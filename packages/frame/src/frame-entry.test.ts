import { expect, test } from 'bun:test'
import { BridgeReadyTimeoutError, FrameEntry } from './frame-entry.ts'
import { SlideFrameError } from './slide-frame-error.ts'

const content = { kind: 'url' as const, src: 'slide.html', bridge: true as const }

function entry(id: string) {
  return new FrameEntry(id, { content, scripts: 'refuse', css: '', cspExtra: '', origins: '' }, content)
}

test("a neighbor's ready does not clear the shown timeout failure", () => {
  const shown = entry('shown')
  const neighbor = entry('neighbor')
  const refusal = new SlideFrameError('shown', 0, new BridgeReadyTimeoutError('shown', 10))
  shown.markFailed(refusal)

  neighbor.markReady()

  expect(shown.failure).toBe(refusal)
})

test("a shown frame's late ready clears only a bridge timeout failure", () => {
  const timedOut = entry('timed-out')
  timedOut.markFailed(new SlideFrameError('timed-out', 0, new BridgeReadyTimeoutError('timed-out', 10)))
  timedOut.markReady()
  expect(timedOut.failure).toBeNull()

  const failed = entry('failed')
  const refusal = new SlideFrameError('failed', 0, new Error('document failed'))
  failed.markFailed(refusal)
  failed.markReady()
  expect(failed.failure).toBe(refusal)
})
