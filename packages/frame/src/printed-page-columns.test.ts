import { describe, expect, test } from 'bun:test'
import { columnOf, fragmentSpan, paperCount } from './printed-page-columns.ts'

describe('printed-page columns', () => {
  test('counts the last occupied column when rounded scroll width crosses the next boundary', () => {
    const textWidth = 725.291
    const spans = [{ start: 2 * textWidth, end: 2176 }]
    expect(Math.ceil((2176 - 0.01) / textWidth)).toBe(4)
    expect(paperCount(spans, textWidth)).toBe(3)
  })

  test('counts an exact-fit full-width last line in its own column', () => {
    const textWidth = 100
    expect(paperCount([{ start: 2 * textWidth, end: 3 * textWidth }], textWidth)).toBe(3)
  })

  test.each([
    ['centered', { start: 220, end: 280 }],
    ['end-aligned', { start: 240, end: 300 }],
  ])('counts a %s short line in the last column', (_alignment, span) => {
    expect(paperCount([span], 100)).toBe(3)
  })

  test('mirrors right-to-left rects around the measure inline-start edge', () => {
    const box = { left: 0, right: 300 }
    const ltr = fragmentSpan({ left: 220, right: 280 }, box, 'ltr')
    const rtl = fragmentSpan({ left: 20, right: 80 }, box, 'rtl')
    expect(rtl).toEqual(ltr)
    expect(paperCount([rtl], 100)).toBe(3)
  })

  test.each([
    ['left-to-right', fragmentSpan({ left: -800, right: -750 }, { left: 0, right: 300 }, 'ltr')],
    ['right-to-left', fragmentSpan({ left: 1050, right: 1100 }, { left: 0, right: 300 }, 'rtl')],
  ])('keeps a fragment before the %s inline-start edge in column zero', (_direction, span) => {
    const textWidth = 725.291
    expect(span.start).toBe(-800)
    expect(columnOf(span, textWidth)).toBe(0)
    expect(paperCount([span], textWidth)).toBe(1)
  })

  test('keeps one paper when there are no fragments', () => {
    expect(paperCount([], 100)).toBe(1)
  })

  test('places a centered first line by its midpoint', () => {
    const span = { start: 160, end: 180 }
    expect(Math.round(span.start / 100)).toBe(2)
    expect(columnOf(span, 100)).toBe(1)
  })
})
