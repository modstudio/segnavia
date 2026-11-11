import { expect, test } from 'bun:test'
import { internalWindowEdge, lineExtent } from './paginate-extent.ts'

test('a line extent includes opening and closing decoration', () => {
  expect(lineExtent({ top: 10, bottom: 20, decorationTop: -6, decorationBottom: 28 })).toEqual({ start: -6, end: 28 })
})

test('an overlapping opening decoration wins over a trailing decoration', () => {
  expect(internalWindowEdge({ top: 0, bottom: 10, decorationBottom: 24 }, { top: 28, bottom: 38, decorationTop: 20 })).toBe(20)
})

test('an internal edge cannot pass the next line top', () => {
  expect(internalWindowEdge({ top: 0, bottom: 10, decorationBottom: 50 }, { top: 30, bottom: 40 })).toBe(30)
})

test('decoration keeps an edge between overlapping line-box edges', () => {
  const previous = { top: 0, bottom: 20, decorationBottom: 24 }
  const next = { top: 10, bottom: 20, decorationTop: 8 }
  const edge = internalWindowEdge(previous, next)
  expect(edge).toBe(10)
  expect(edge).toBeGreaterThanOrEqual(next.top)
  expect(edge).toBeLessThanOrEqual(previous.bottom)
})
