import { expect, test } from 'bun:test'
import type { Playback, PlaybackState } from './playback.ts'
import { PlayerSoundPlayback } from './player-sound.ts'

function state(playing = false): PlaybackState {
  return {
    index: 0,
    direction: 'ltr',
    playing,
    progress: 0,
    elapsedMs: 0,
    totalMs: 1_000,
    playback: 'continuous',
    muted: false,
    timeline: { slides: [{ startMs: 0, durationMs: 1_000, untimed: false }], totalMs: 1_000 },
    playable: true,
    audible: true,
    reach: 1,
    lockedFrom: 1,
  }
}

class FakePlayback extends EventTarget implements Playback {
  state = state()
  pauses = 0
  plays = 0
  async play() {
    this.plays++
    this.change(true)
  }
  pause() {
    this.pauses++
    this.change(false)
  }
  toggle() {}
  setMuted() {}
  async seek() {}
  change(playing: boolean) {
    this.state = state(playing)
    this.dispatchEvent(new CustomEvent('change', { detail: this.state }))
  }
}

test('placed sound playback prevents the event, pauses the deck, shows controls, and disconnects cleanly', async () => {
  const deck = new FakePlayback()
  const audio = new FakePlayback()
  const element = { sound: null, src: '', controller: audio }
  const visibility: boolean[] = []
  const player = new PlayerSoundPlayback(deck, element, (visible) => visibility.push(visible))
  const sound = { format: 'mp3' as const, durationMs: 1_000 }
  const event = new CustomEvent('segnavia-sound-play', { detail: { sound, src: 'theme.mp3', placement: '0' }, cancelable: true })

  player.handle(event)
  await Promise.resolve()
  expect(event.defaultPrevented).toBe(true)
  expect(element).toMatchObject({ sound, src: 'theme.mp3' })
  expect(deck.pauses).toBe(1)
  expect(audio.plays).toBe(1)
  expect(visibility.at(-1)).toBe(true)

  audio.change(false)
  expect(visibility.at(-1)).toBe(false)
  player.disconnect()
  expect(audio.pauses).toBe(1)
})

test('deck and placed sound playback pause each other', () => {
  const deck = new FakePlayback()
  const audio = new FakePlayback()
  const player = new PlayerSoundPlayback(deck, { sound: null, src: '', controller: audio }, () => {})
  deck.change(true)
  audio.change(true)
  expect(deck.pauses).toBe(1)
  deck.state = state(true)
  player.deckChanged(deck.state)
  expect(audio.pauses).toBe(1)
})
