import { afterEach, expect, test } from 'bun:test'
import type { Clock } from './clock.ts'
import { DeckController } from './controller.ts'

const realAudio = globalThis.Audio

afterEach(() => {
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: realAudio })
})

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

test('play restarts from an untimed last slide without ending again', async () => {
  let ended = false
  let pending: (() => void) | null = null
  const controller = new DeckController({
    hash: null,
    playback: 'continuous',
    clock: (): Clock => ({
      word: () => null,
      ended: () => ended,
      elapsed: () => 0,
      progress: () => (ended ? 1 : 0),
      pause: () => {},
      resume: () => {},
      seek: () => {},
      muted: false,
      stop: () => {},
    }),
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
      { id: 'b', content: { kind: 'html', html: '' } },
    ],
  })
  await controller.play()
  ended = true
  const tick = pending as (() => void) | null
  pending = null
  tick?.()
  await Bun.sleep(0)
  expect(controller.state.index).toBe(1)
  expect(ends).toBe(0)

  await controller.play()
  expect(controller.state.index).toBe(0)
  expect(ends).toBe(0)
})

test('seeking a paused controller into recorded narration stays silent', async () => {
  let plays = 0
  class FakeAudio extends EventTarget {
    currentTime = 0
    muted = false
    pause() {}
    play() {
      plays++
      return Promise.resolve()
    }
  }
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio })
  const controller = new DeckController({ hash: null, base: 'https://example.com/deck.json' })
  await controller.load({
    title: 'T',
    slides: [
      { id: 'a', content: { kind: 'html', html: '' }, holdMs: 100 },
      {
        id: 'b',
        content: { kind: 'html', html: '' },
        narration: { text: 'hello', words: [], durationMs: 500, audio: 'a.mp3', live: false, cues: [] },
      },
    ],
  })
  await controller.seek(350)
  expect(controller.state.playing).toBe(false)
  expect(plays).toBe(0)
})
