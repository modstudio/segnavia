import { describe, expect, test } from 'bun:test'
import { annotationFocusBox, fitImage, imageFrameStyle } from './image-fit.ts'

const slide = { width: 1280, height: 720 }
const tall = { width: 1280, height: 2400 }

describe('fitImage', () => {
  test('insets a framed contained image', () => {
    expect(fitImage(slide, { width: 1280, height: 400 }, 'contain', undefined, true)).toEqual({
      scale: (1280 - 112) / 1280,
      x: 56,
      y: (720 - 400 * ((1280 - 112) / 1280)) / 2,
      framed: true,
    })
  })

  test('contains the whole image and centers its bands', () => {
    expect(fitImage(slide, tall, 'contain')).toEqual({ scale: 0.3, x: 448, y: 0, framed: false })
  })

  test('covers the slide with a centered crop', () => {
    expect(fitImage(slide, tall, 'cover')).toEqual({ scale: 1, x: 0, y: -840, framed: false })
  })

  test('fills the width from the top and centers an image shorter than the slide', () => {
    expect(fitImage(slide, tall, 'width')).toEqual({ scale: 1, x: 0, y: 0, framed: false })
    expect(fitImage(slide, { width: 1280, height: 400 }, 'width')).toEqual({ scale: 1, x: 0, y: 160, framed: false })
  })

  test('moves a corner focus into view while preserving cover', () => {
    expect(fitImage(slide, tall, 'focus', { x: 80, y: 2100, width: 200, height: 120 })).toEqual({ scale: 1, x: 0, y: -1680, framed: false })
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

  test('does not frame placements that cover the slide', () => {
    expect(fitImage(slide, tall, 'cover', undefined, true).framed).toBe(false)
    expect(fitImage(slide, tall, 'width', undefined, true).framed).toBe(false)
    expect(fitImage(slide, tall, 'focus', { x: 80, y: 2100, width: 200, height: 120 }, true).framed).toBe(false)
  })

  test('frames a short width image', () => {
    expect(fitImage(slide, { width: 1280, height: 400 }, 'width', undefined, true)).toEqual({ scale: 0.9125, x: 56, y: 177.5, framed: true })
  })

  test('frames a focus placement that zooms out and keeps its focus inside the inset slide', () => {
    const focus = { x: 100, y: 100, width: 1080, height: 2100 }
    const placement = fitImage(slide, tall, 'focus', focus, true)
    expect(placement.framed).toBe(true)
    expect(focus.x * placement.scale + placement.x).toBeGreaterThanOrEqual(56 - 0.001)
    expect(focus.y * placement.scale + placement.y).toBeGreaterThanOrEqual(56 - 0.001)
    expect((focus.x + focus.width) * placement.scale + placement.x).toBeLessThanOrEqual(1280 - 56 + 0.001)
    expect((focus.y + focus.height) * placement.scale + placement.y).toBeLessThanOrEqual(720 - 56 + 0.001)
  })
})

describe('imageFrameStyle', () => {
  test('counter-scales the radius and shadow and omits them when unframed', () => {
    expect(imageFrameStyle({ scale: 1, x: 56, y: 56, framed: true })).toEqual({
      borderRadius: '14px',
      boxShadow: '0 4px 18px rgba(15,23,42,.18), 0 0 0 1px rgba(15,23,42,.08)',
    })
    expect(imageFrameStyle({ scale: 0.3, x: 56, y: 56, framed: true })).toEqual({
      borderRadius: '46.66666666666667px',
      boxShadow: '0 13.333333333333334px 60px rgba(15,23,42,.18), 0 0 0 3.3333333333333335px rgba(15,23,42,.08)',
    })
    expect(imageFrameStyle({ scale: 1, x: 0, y: 0, framed: false })).toBeUndefined()
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
