import { expect, test } from 'bun:test'
import { containSlideSize, playerControls, playerFit } from './player-layout.ts'

test('player layout attributes use the documented values and defaults', () => {
  expect(playerFit(null)).toBe('contain')
  expect(playerFit('width')).toBe('width')
  expect(playerFit('height')).toBe('height')
  expect(playerFit('other')).toBe('contain')
  expect(playerControls(null)).toBe('below')
  expect(playerControls('overlay')).toBe('overlay')
  expect(playerControls('other')).toBe('below')
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
