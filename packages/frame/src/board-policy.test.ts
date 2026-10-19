import { describe, expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import { boardTier, checkResolved, keyToView, pinchOf, provisionalShape, resolvedShape, shouldMountItem, shouldRefitReveal } from './board-policy.ts'

test('a pinch needs two pointers and never has a zero distance', () => {
  expect(pinchOf([{ x: 0, y: 0 }])).toBeNull()
  expect(
    pinchOf([
      { x: 0, y: 0 },
      { x: 6, y: 8 },
    ]),
  ).toEqual({ midpoint: { x: 3, y: 4 }, distance: 10 })
  expect(
    pinchOf([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ])?.distance,
  ).toBe(1)
})

const view = { zoom: 1, pan: { x: 0, y: 0 }, viewport: { width: 1000, height: 500 } }
const paperItem: BoardItem = { id: 'paper', kind: 'paper', address: 'paper', x: 0, y: 0, width: 100 }
const imposition = { paper: 'letter' as const, orientation: 'portrait' as const, columns: 1, rows: 1, cell: { width: 100, height: 100 } }

describe('board policy', () => {
  test('uses natural and provisional shapes', () => {
    expect(provisionalShape('deck')).toEqual({ width: 16, height: 9 })
    expect(provisionalShape('page').height).toBeCloseTo(Math.SQRT2)
    expect(provisionalShape('image')).toEqual({ width: 4, height: 3 })
    expect(resolvedShape({ kind: 'image', src: 'image.png', width: 640, height: 480 })).toEqual({ width: 640, height: 480 })
  })

  test('refuses resolved values that do not match the item kind', () => {
    expect(() => checkResolved(paperItem, { kind: 'image', src: 'image.png', width: 10, height: 10 })).toThrow(
      'The resolved item kind is image, not paper; return a resolved paper.',
    )
  })

  test('refuses zero, negative and non-finite resolved dimensions', () => {
    expect(() => checkResolved(paperItem, { kind: 'paper', pages: [], imposition, size: { width: 0, height: 10 } })).toThrow(
      'The resolved paper size has a width of 0; return a positive width.',
    )
    expect(() => checkResolved(paperItem, { kind: 'paper', pages: [], imposition, size: { width: 10, height: -1 } })).toThrow(
      'The resolved paper size has a height of -1; return a positive height.',
    )
    expect(() => checkResolved(paperItem, { kind: 'paper', pages: [], imposition, size: { width: Number.POSITIVE_INFINITY, height: 10 } })).toThrow(
      'The resolved paper size has a width of Infinity; return a positive width.',
    )
  })

  test('accepts a valid resolved value', () => {
    expect(checkResolved(paperItem, { kind: 'paper', pages: [], imposition, size: { width: 10, height: 20 } })).toBeUndefined()
  })

  test('chooses live detail at the threshold', () => {
    expect(boardTier(239, 240)).toBe('cover')
    expect(boardTier(240, 240)).toBe('live')
  })

  test('uses separate mount and unmount margins', () => {
    expect(shouldMountItem(false, false, true)).toBe(false)
    expect(shouldMountItem(false, true, true)).toBe(true)
    expect(shouldMountItem(true, false, true)).toBe(true)
    expect(shouldMountItem(true, false, false)).toBe(false)
  })

  test('refits only the pending revealed item when its resolved height changes', () => {
    expect(shouldRefitReveal('page', 'page', 140, 1000)).toBe(true)
    expect(shouldRefitReveal('other', 'page', 140, 1000)).toBe(false)
    expect(shouldRefitReveal('page', 'page', 140, 140)).toBe(false)
  })

  test('maps physical keys to pan, zoom and fit', () => {
    expect(keyToView(view, 'ArrowLeft')).toEqual({ kind: 'view', view: { ...view, pan: { x: 100, y: 0 } } })
    expect(keyToView(view, '=')?.kind).toBe('view')
    expect(keyToView(view, '0')).toEqual({ kind: 'fit' })
    expect(keyToView(view, 'a')).toBeNull()
  })
})
