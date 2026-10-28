import { describe, expect, test } from 'bun:test'
import {
  ACCEPTANCE_BARS,
  BOOK_MEASUREMENT_CSS,
  judgePress,
  MARKER_BORDER,
  MARKER_FILL,
  MARKER_INSET,
  MARKER_SIZE,
  MEASUREMENT_CSS,
  markerAfterCss,
} from './config.ts'

describe('press acceptance', () => {
  test('chooses the strict bar for controls and the regression ceiling for effects', () => {
    const difference = { mean: 5, p99: 50 }
    expect(judgePress('control', difference)).toBeFalse()
    expect(judgePress('effects', difference)).toBeTrue()
  })

  test('book pages gate press on mean only', () => {
    expect(judgePress('book', { mean: 5, p99: 163 })).toBeTrue()
    expect(judgePress('book', { mean: 11, p99: 0 })).toBeFalse()
  })
})

test('book and page markers share inset, size, fill and border', () => {
  const shared = markerAfterCss('html::after', 'fixed')
  expect(MEASUREMENT_CSS).toContain(shared)
  expect(BOOK_MEASUREMENT_CSS).toBe(markerAfterCss('[data-segnavia-book-page]::after', 'absolute'))
  expect(BOOK_MEASUREMENT_CSS).toContain(`left:${MARKER_INSET}px`)
  expect(BOOK_MEASUREMENT_CSS).toContain(`width:${MARKER_SIZE}px`)
  expect(BOOK_MEASUREMENT_CSS).toContain(`border:${MARKER_BORDER}px`)
  expect(BOOK_MEASUREMENT_CSS).toContain(`rgb(${MARKER_FILL.join(' ')})`)
  expect(MEASUREMENT_CSS).toContain(`left:${MARKER_INSET}px`)
  expect(MEASUREMENT_CSS).toContain(`width:${MARKER_SIZE}px`)
})

test('a backdrop raster exempts only the size multiple', () => {
  const size = ACCEPTANCE_BARS.find((bar) => bar.id === 'size')
  if (!size) throw new Error('The size bar is missing.')
  const facts = { rasterEffects: 2 } as never
  expect(size.pass({ pdfBytes: 499_999, effectlessPdfBytes: 100_000, multiple: 5, rasterEffects: 2 }, facts)).toBeTrue()
  expect(size.pass({ pdfBytes: 500_001, effectlessPdfBytes: 100_000, multiple: 5, rasterEffects: 2 }, facts)).toBeFalse()
  expect(size.reason({ pdfBytes: 499_999, effectlessPdfBytes: 100_000, multiple: 5, rasterEffects: 2 }, facts)).toContain('500,000-byte cap')
})
