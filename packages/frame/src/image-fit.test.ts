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

  test('keeps a long arrow label visible on the tail side of a wide image', () => {
    const image = { width: 2400, height: 720 }
    const label = 'A'.repeat(30)
    const arrow = { head: { x: 1800, y: 360 }, tail: { x: 600, y: 360 }, label }
    const focus = annotationFocusBox(image, [{ ring: null, badge: null, arrow }])
    const placement = fitImage(slide, image, 'focus', focus)
    const labelWidth = 0.6 * 18 * label.length + 8
    const labelLeft = (arrow.tail.x - labelWidth / 2) * placement.scale + placement.x
    const labelRight = (arrow.tail.x + labelWidth / 2) * placement.scale + placement.x

    expect(focus).toEqual({ x: 410, y: 306, width: 1414, height: 78 })
    expect(labelLeft).toBeGreaterThanOrEqual(0)
    expect(labelRight).toBeLessThanOrEqual(slide.width)
    expect(annotationFocusBox(image, [{ ring: null, badge: null, arrow: { ...arrow, label: null } }])).toEqual({
      x: 576,
      y: 336,
      width: 1248,
      height: 48,
    })
  })
})
