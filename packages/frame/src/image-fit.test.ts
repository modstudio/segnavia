import { describe, expect, test } from 'bun:test'
import { annotationFocusBox, fitImage } from './image-fit.ts'

const slide = { width: 1280, height: 720 }
const tall = { width: 1280, height: 2400 }

describe('fitImage', () => {
  test('contains the whole image and centers its bands', () => {
    expect(fitImage(slide, tall, 'contain')).toEqual({ scale: 0.3, x: 448, y: 0 })
  })

  test('covers the slide with a centered crop', () => {
    expect(fitImage(slide, tall, 'cover')).toEqual({ scale: 1, x: 0, y: -840 })
  })

  test('fills the width from the top and centers an image shorter than the slide', () => {
    expect(fitImage(slide, tall, 'width')).toEqual({ scale: 1, x: 0, y: 0 })
    expect(fitImage(slide, { width: 1280, height: 400 }, 'width')).toEqual({ scale: 1, x: 0, y: 160 })
  })

  test('moves a corner focus into view while preserving cover', () => {
    expect(fitImage(slide, tall, 'focus', { x: 80, y: 2100, width: 200, height: 120 })).toEqual({ scale: 1, x: 0, y: -1680 })
  })

  test('zooms out toward contain when the focus is larger than the cover crop', () => {
    const placement = fitImage(slide, tall, 'focus', { x: 100, y: 100, width: 1080, height: 2100 })
    expect(placement.scale).toBeCloseTo(720 / 2100)
    expect(placement.x).toBeCloseTo((1280 - 1280 * placement.scale) / 2)
    expect(placement.y).toBeCloseTo(360 - 1150 * placement.scale)
  })

  test('uses cover when focus has no annotations', () => {
    expect(fitImage(slide, tall, 'focus')).toEqual(fitImage(slide, tall, 'cover'))
  })
})

describe('annotationFocusBox', () => {
  test('unites rings, badges and arrows with padding clamped to the image', () => {
    expect(
      annotationFocusBox(tall, [
        { ring: { x: 4, y: 10, width: 80, height: 40 }, badge: { center: { x: 110, y: 55 }, number: 1 }, arrow: null },
        { ring: null, badge: null, arrow: { head: { x: 300, y: 2200 }, tail: { x: 200, y: 2100 }, label: null } },
      ]),
    ).toEqual({ x: 0, y: 0, width: 324, height: 2224 })
  })
})
