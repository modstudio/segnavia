import { describe, expect, test } from 'bun:test'
import { boardTier, keyToView, provisionalShape, resolvedShape, shouldMountItem } from './board-policy.ts'

const view = { zoom: 1, pan: { x: 0, y: 0 }, viewport: { width: 1000, height: 500 } }

describe('board policy', () => {
  test('uses natural and provisional shapes', () => {
    expect(provisionalShape('deck')).toEqual({ width: 16, height: 9 })
    expect(provisionalShape('page').height).toBeCloseTo(Math.SQRT2)
    expect(provisionalShape('image')).toEqual({ width: 4, height: 3 })
    expect(resolvedShape({ kind: 'image', src: 'image.png', width: 640, height: 480 })).toEqual({ width: 640, height: 480 })
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

  test('maps physical keys to pan, zoom and fit', () => {
    expect(keyToView(view, 'ArrowLeft')).toEqual({ kind: 'view', view: { ...view, pan: { x: 100, y: 0 } } })
    expect(keyToView(view, '=')?.kind).toBe('view')
    expect(keyToView(view, '0')).toEqual({ kind: 'fit' })
    expect(keyToView(view, 'a')).toBeNull()
  })
})
