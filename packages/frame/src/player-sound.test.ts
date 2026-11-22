import { expect, test } from 'bun:test'
import type { Playback, PlaybackState } from './playback.ts'
import { PlayerSoundPlayback } from './player-sound.ts'

function state(playing = false, index = 0): PlaybackState {
  return {
    index,
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
  change(playing: boolean, index = this.state.index) {
    this.state = state(playing, index)
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

test('placed sound stops after a slide step and keeps playing on the same slide', async () => {
  const deck = new FakePlayback()
  const audio = new FakePlayback()
  const visibility: boolean[] = []
  const player = new PlayerSoundPlayback(deck, { sound: null, src: '', controller: audio }, (visible) => visibility.push(visible))
  player.handle(
    new CustomEvent('segnavia-sound-play', {
      detail: { sound: { format: 'mp3', durationMs: 1_000 }, src: 'theme.mp3', placement: '0' },
      cancelable: true,
    }),
  )
  await Promise.resolve()

  player.deckChanged(state(false, 0))
  expect(audio.pauses).toBe(0)
  expect(audio.state.playing).toBe(true)

  player.deckChanged(state(false, 1))
  expect(audio.pauses).toBe(1)
  expect(visibility.at(-1)).toBe(false)
})

test('a refused placed sound play is caught and hides the controls', async () => {
  const deck = new FakePlayback()
  const audio = new FakePlayback()
  audio.play = async () => {
    throw new Error('refused')
  }
  const visibility: boolean[] = []
  const player = new PlayerSoundPlayback(deck, { sound: null, src: '', controller: audio }, (visible) => visibility.push(visible))
  player.handle(
    new CustomEvent('segnavia-sound-play', {
      detail: { sound: { format: 'mp3', durationMs: 1_000 }, src: 'missing.mp3', placement: '0' },
      cancelable: true,
    }),
  )
  await Promise.resolve()
  await Promise.resolve()
  expect(visibility.at(-1)).toBe(false)
})
