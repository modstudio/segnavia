import { expect, test } from 'bun:test'
import type { Clock } from './clock.ts'
import { DeckController } from './controller.ts'
import { COMPACT_PLAYER_WIDTH, compactBarHeight, containSlideSize, measuredBarHeight, PlayerMeasureChanges, playerControls, playerFit } from './player-layout.ts'

test('player layout attributes use the documented values and defaults', () => {
  expect(playerFit(null)).toBe('contain')
  expect(playerFit('width')).toBe('width')
  expect(playerFit('height')).toBe('height')
  expect(playerFit('other')).toBe('contain')
  expect(playerControls(null)).toBe('below')
  expect(playerControls('overlay')).toBe('overlay')
  expect(playerControls('other')).toBe('below')
})

test('compact chrome height is track plus the tallest transport cell plus actions', () => {
  expect(COMPACT_PLAYER_WIDTH).toBe(560)
  expect(compactBarHeight({ track: 10, start: 40, center: 44, endControls: 42, actions: 48 })).toBe(102)
  expect(compactBarHeight({ track: 10, start: 40, center: 44, endControls: 42, actions: 0 })).toBe(54)
})

function fakeRoot(heights: Record<string, number>): ShadowRoot {
  return {
    querySelector: (selector: string) => (selector in heights ? { offsetHeight: heights[selector] } : null),
  } as ShadowRoot
}

test('measured bar height prefers the bar box and otherwise sums the flattened rows', () => {
  expect(measuredBarHeight(fakeRoot({ '.bar': 96 }))).toBe(96)
  expect(
    measuredBarHeight(
      fakeRoot({
        '.bar': 0,
        'segnavia-track': 10,
        '.start': 40,
        '.center': 44,
        '.end-controls': 42,
        '.actions': 48,
      }),
    ),
  ).toBe(102)
})

test('contain sizing respects width, available height and its height floor', () => {
  expect(containSlideSize({ availableWidth: 1280, availableHeight: 720, chromeHeight: 180, reserve: 0, ratio: 16 / 9 })).toEqual({
    width: 960,
    height: 540,
  })
  expect(containSlideSize({ availableWidth: 1280, availableHeight: 1400, chromeHeight: 180, reserve: 0, ratio: 16 / 9 })).toEqual({
    width: 1280,
    height: 720,
  })
  expect(containSlideSize({ availableWidth: 360, availableHeight: 720, chromeHeight: 180, reserve: 0, ratio: 16 / 9 })).toEqual({
    width: 360,
    height: 202.5,
  })
  const short = containSlideSize({ availableWidth: 1280, availableHeight: 300, chromeHeight: 180, reserve: 0, ratio: 16 / 9 })
  expect(short.width).toBeCloseTo(1280 / 3)
  expect(short.height).toBe(240)
})

test('playback ticks do not invalidate player measurement', async () => {
  const scheduled: { tick?: () => void } = {}
  let elapsed = 0
  const controller = new DeckController({
    hash: null,
    persist: false,
    clock: (): Clock => ({
      word: () => null,
      ended: () => false,
      elapsed: () => ++elapsed,
      progress: () => 0,
      pause: () => {},
      resume: () => {},
      seek: () => {},
      stop: () => {},
      muted: false,
    }),
    schedule: (tick) => {
      scheduled.tick = tick
      return () => {
        scheduled.tick = undefined
      }
    },
  })
  const changes = new PlayerMeasureChanges()
  let measures = 0
  controller.addEventListener('change', (event) => {
    if (changes.update((event as CustomEvent).detail)) measures++
  })
  await controller.load({ title: 'T', size: { width: 1280, height: 720 }, slides: [{ id: 'a', content: { kind: 'html', html: '' }, holdMs: 1000 }] })
  await controller.play()
  const initialMeasures = measures
  for (let index = 0; index < 50; index++) {
    const tick = scheduled.tick
    if (!tick) throw new Error('playback tick was not scheduled')
    tick()
  }
  expect(measures).toBe(initialMeasures)
})
