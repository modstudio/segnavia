import { expect, test } from 'bun:test'
import { MESSAGE } from './bridge.ts'
import { dispatchSoundPlay } from './sound-play.ts'

test('a known sound handle dispatches its resolved sound and an unknown handle is silent', () => {
  const target = new EventTarget()
  const sound = { format: 'mp3' as const, durationMs: 1_000, title: { text: 'Theme' } }
  const sounds = new Map([['0', { sound, src: 'sound:theme' }]])
  const received: CustomEvent[] = []
  target.addEventListener('segnavia-sound-play', (event) => received.push(event as CustomEvent))

  expect(dispatchSoundPlay(target, { type: MESSAGE.soundPlay, placement: '0' }, sounds)).toBe(true)
  expect(dispatchSoundPlay(target, { type: MESSAGE.soundPlay, placement: '1' }, sounds)).toBe(false)
  expect(received).toHaveLength(1)
  expect(received[0]?.detail).toEqual({ sound, src: 'sound:theme', placement: '0' })
  expect(received[0]?.bubbles).toBe(true)
  expect(received[0]?.composed).toBe(true)
  expect(received[0]?.cancelable).toBe(true)
  expect(received[0]?.defaultPrevented).toBe(false)
})
