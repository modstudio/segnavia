import { expect, test } from 'bun:test'
import type { Clock } from './clock.ts'
import { DeckController } from './controller.ts'

test('play restarts an ended deck in either playback mode', async () => {
  for (const playback of ['step', 'continuous'] as const) {
    const clocks: Array<{ elapsed: number; ended: boolean }> = []
    let pending: (() => void) | null = null
    const controller = new DeckController({
      hash: null,
      playback,
      clock: (): Clock => {
        const state = { elapsed: 0, ended: false }
        clocks.push(state)
        return {
          word: () => null,
          ended: () => state.ended,
          elapsed: () => state.elapsed,
          progress: () => (state.ended ? 1 : 0),
          pause: () => {},
          resume: () => {},
          seek: (ms) => {
            state.elapsed = ms
          },
          muted: false,
          stop: () => {},
        }
      },
      schedule: (tick) => {
        pending = tick
        return () => {
          pending = null
        }
      },
    })
    let ends = 0
    controller.addEventListener('end', () => ends++)
    await controller.load({
      title: 'T',
      slides: [
        {
          id: 'a',
          content: { kind: 'html', html: '' },
          narration: { text: 'hello', words: [{ text: 'hello', startMs: 0, endMs: 80 }], durationMs: 1000, audio: null, live: false, cues: [] },
        },
      ],
    })
    await controller.play()
    const first = clocks[0]
    if (!first) throw new Error('clock was not created')
    first.ended = true
    const tick = pending as (() => void) | null
    pending = null
    tick?.()
    await Bun.sleep(0)
    expect(ends).toBe(1)

    await controller.play()
    expect(controller.state.index).toBe(0)
    expect(controller.state.playing).toBe(true)
    expect(clocks).toHaveLength(2)
    expect(clocks[1]?.elapsed).toBe(0)
    expect(ends).toBe(1)
  }
})
