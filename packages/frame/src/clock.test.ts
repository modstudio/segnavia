import { afterEach, describe, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { speechClock, timedClock } from './clock.ts'

const realPerformance = globalThis.performance
const realAudio = globalThis.Audio
const realWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const realUtterance = Object.getOwnPropertyDescriptor(globalThis, 'SpeechSynthesisUtterance')

afterEach(() => {
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: realPerformance })
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: realAudio })
  if (realWindow) Object.defineProperty(globalThis, 'window', realWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  if (realUtterance) Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', realUtterance)
  else Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance')
})

function slide(input: Record<string, unknown>) {
  return Deck.parse({ title: 'T', slides: [{ id: 's', content: { kind: 'html', html: '' }, ...input }] }).slides[0] as NonNullable<
    ReturnType<typeof Deck.parse>['slides'][number]
  >
}

describe('slide clock', () => {
  test('a wall clock pauses, resumes and seeks within a hold', () => {
    let now = 0
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } })
    const clock = timedClock(slide({ holdMs: 1000 }), null)
    now = 300
    expect(clock.elapsed()).toBe(300)
    clock.pause()
    now = 700
    expect(clock.elapsed()).toBe(300)
    clock.resume()
    now = 800
    expect(clock.elapsed()).toBe(400)
    clock.seek(900)
    now = 850
    expect(clock.elapsed()).toBe(950)
  })

  test('before and after are wall timed while audio controls narration', () => {
    let now = 0
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } })
    class FakeAudio extends EventTarget {
      currentTime = 0
      muted = false
      pause() {}
      play() {
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
    }
    Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio })
    const narration = { text: 'hello', words: [{ text: 'hello', startMs: 0, endMs: 500 }], durationMs: 500, audio: 'a.mp3', live: false, cues: [] }
    const clock = timedClock(slide({ narration, beforeMs: 100, afterMs: 200 }), 'a.mp3')
    expect(clock.word()).toBeNull()
    clock.seek(250)
    expect(clock.elapsed()).toBe(250)
    clock.muted = true
    expect(clock.muted).toBe(true)
    clock.seek(650)
    now = 150
    expect(clock.elapsed()).toBe(800)
    expect(clock.word()).toBe(0)
    expect(clock.ended()).toBe(true)
  })

  test('live speech seek returns to the start and mute cancels speech without ending timing', () => {
    let now = 0
    let cancellations = 0
    const synth = {
      cancel: () => cancellations++,
      speak: () => {},
      pause: () => {},
      resume: () => {},
      getVoices: () => [],
    }
    class FakeUtterance {
      lang = ''
      voice = null
      onboundary: ((event: { name: string; charIndex: number }) => void) | null = null
    }
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { speechSynthesis: synth } })
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance })
    const narration = { text: 'hello', words: [], durationMs: 500, audio: null, live: true, cues: [] }
    const clock = speechClock(slide({ narration, beforeMs: 100 }), undefined)
    now = 200
    clock.word()
    clock.muted = true
    expect(clock.muted).toBe(true)
    expect(clock.elapsed()).toBe(100)
    clock.seek(300)
    expect(clock.elapsed()).toBe(0)
    expect(cancellations).toBeGreaterThan(1)
  })

  test('seeking live speech while paused stays silent until resume', () => {
    let speeches = 0
    const synth = {
      cancel: () => {},
      speak: () => speeches++,
      pause: () => {},
      resume: () => {},
      getVoices: () => [],
    }
    class FakeUtterance {
      lang = ''
      voice = null
      onboundary: ((event: { name: string; charIndex: number }) => void) | null = null
    }
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 0 } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { speechSynthesis: synth } })
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance })
    const narration = { text: 'hello', words: [], durationMs: 500, audio: null, live: true, cues: [] }
    const clock = speechClock(slide({ narration }), undefined)
    clock.pause()
    clock.seek(300)
    clock.word()
    clock.elapsed()
    expect(speeches).toBe(0)
    clock.resume()
    expect(speeches).toBe(1)
  })
})
