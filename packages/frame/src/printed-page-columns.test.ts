import { describe, expect, test } from 'bun:test'
import { type FragmentSpan, fragmentColumns, fragmentSpan, paperCount } from './printed-page-columns.ts'

const box = { left: 0, right: 3000 }

function mirroredSpans(span: FragmentSpan): FragmentSpan[] {
  const width = span.end - span.start
  return [
    fragmentSpan({ left: box.left + span.start, right: box.left + span.end }, box, 'ltr'),
    fragmentSpan({ left: box.right - span.start - width, right: box.right - span.start }, box, 'rtl'),
  ]
}

describe('printed-page columns', () => {
  test('counts the last occupied column when rounded scroll width crosses the next boundary', () => {
    const textWidth = 725.291
    const spans = [{ start: 2 * textWidth, end: 2176 }]
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
    const measure = { left: 0, right: 300 }
    const ltr = fragmentSpan({ left: 220, right: 280 }, measure, 'ltr')
    const rtl = fragmentSpan({ left: 20, right: 80 }, measure, 'rtl')
    expect(rtl).toEqual(ltr)
    expect(paperCount([rtl], 100)).toBe(3)
  })

  test.each([
    ['left-to-right', fragmentSpan({ left: -800, right: -750 }, { left: 0, right: 300 }, 'ltr')],
    ['right-to-left', fragmentSpan({ left: 1050, right: 1100 }, { left: 0, right: 300 }, 'rtl')],
  ])('keeps a fragment before the %s inline-start edge in column zero', (_direction, span) => {
    const textWidth = 725.291
    expect(span.start).toBe(-800)
    expect(fragmentColumns(span, textWidth)).toEqual({ first: 0, last: 0 })
    expect(paperCount([span], textWidth)).toBe(1)
  })

  test('keeps one paper when there are no fragments', () => {
    expect(paperCount([], 100)).toBe(1)
  })

  test('places a centered first line by its midpoint', () => {
    const span = { start: 160, end: 180 }
    expect(fragmentColumns(span, 100).first).toBe(1)
  })

  test.each(mirroredSpans({ start: 0, end: 300 }))('counts a three-column-wide fragment and owns its id on paper one', (span) => {
    expect(fragmentColumns(span, 100)).toEqual({ first: 0, last: 2 })
    expect(paperCount([span], 100)).toBe(3)
  })

  test.each(mirroredSpans({ start: 0, end: 3 * 702.9 }))('counts a three-column-wide Letter table rect', (span) => {
    expect(paperCount([span], 702.9)).toBe(3)
  })

  test.each(mirroredSpans({ start: 300, end: 300 }))('keeps a zero-width boundary fragment in the column where it starts', (span) => {
    expect(fragmentColumns(span, 100)).toEqual({ first: 3, last: 3 })
    expect(paperCount([span], 100)).toBe(4)
  })

  test.each(mirroredSpans({ start: 199.6, end: 220 }))('places a fragment starting 0.4px before a boundary in that column', (span) => {
    expect(fragmentColumns(span, 100).first).toBe(2)
  })
})
