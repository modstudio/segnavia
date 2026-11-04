import { describe, expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import { Cover, MAX_BOARD_ZOOM, MIN_BOARD_ZOOM } from '@segnavia/format'
import {
  BOARD_ZOOM_FACTOR,
  boardItemFact,
  boardShapeFacts,
  boardTier,
  checkResolved,
  keyToView,
  pinchOf,
  shouldMountItem,
  shouldRefitReveal,
  zoomView,
} from './board-policy.ts'
import { coverPresentation } from './designed-cover-policy.ts'

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
  test.each([
    [
      { cover: { page: { html: 'designed' } }, picture: 'kept.webp' },
      { kind: 'picture', src: 'kept.webp' },
    ],
    [{ cover: { page: { html: 'designed' } } }, { kind: 'live', cover: expect.any(Object) }],
    [undefined, { kind: 'fallback' }],
  ] as const)('applies each ordered cover preference', (designed, expected) => {
    const parsed = designed ? { ...designed, cover: Cover.parse(designed.cover) } : undefined
    expect(coverPresentation(parsed)).toEqual(expected)
  })
  test('adapts every resolved board item to a shape fact', () => {
    type Resolved = Parameters<typeof boardItemFact>[0]
    const fact = (value: unknown) => boardItemFact(value as Resolved)
    expect(fact({ kind: 'image', width: 640, height: 480 })).toEqual({ kind: 'media', width: 640, height: 480 })
    expect(fact({ kind: 'shot', width: 1280, height: 720 })).toEqual({ kind: 'shot', width: 1280, height: 720 })
    expect(fact({ kind: 'deck', deck: { size: { width: 16, height: 9 } } })).toEqual({ kind: 'deck', deck: { size: { width: 16, height: 9 } } })
    for (const kind of ['page', 'paper', 'book'] as const)
      expect(fact({ kind, size: { width: 8, height: 11 } })).toEqual({ kind, size: { width: 8, height: 11 } })
  })

  test('keys resolved facts by address, shares them and omits unresolved addresses', () => {
    type Resolved = NonNullable<ReturnType<Parameters<typeof boardShapeFacts>[1]>>
    const shared = { id: 'shared', kind: 'media' as const, address: 'asset', x: 0, y: 0, width: 100 }
    const items = [shared, { ...shared, id: 'also-shared' }, { ...shared, id: 'missing', address: 'missing' }]
    const facts = boardShapeFacts(items, (address) =>
      address === 'asset' ? ({ kind: 'image', src: 'image.png', width: 640, height: 480 } as Resolved) : undefined,
    )
    expect(facts).toEqual({ asset: { kind: 'media', width: 640, height: 480 } })
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
    expect(checkResolved(paperItem, { kind: 'paper', pages: [], imposition, size: { width: 10, height: 20 } })).toEqual({
      kind: 'paper',
      pages: [],
      imposition,
      size: { width: 10, height: 20 },
      designedCover: undefined,
    })
  })

  test('returns a parsed cover without changing the host value', () => {
    const designedCover = { cover: { page: { html: 'cover' } } }
    const resolved = { kind: 'paper' as const, pages: [], imposition, size: { width: 10, height: 20 }, designedCover }
    const checked = checkResolved(paperItem, resolved)
    expect(checked.designedCover?.cover.page.print).toBeDefined()
    expect(resolved.designedCover).toBe(designedCover)
    expect('print' in resolved.designedCover.cover.page).toBe(false)
  })

  test('parses a resolved designed cover and names its field on refusal', () => {
    const resolved = {
      kind: 'paper' as const,
      pages: [],
      imposition,
      size: { width: 10, height: 20 },
      designedCover: { cover: { page: { html: '', scripts: 'sandboxed' as const } } },
    }
    expect(() => checkResolved(paperItem, resolved)).toThrow('resolved board item "paper" has an invalid designedCover.cover')
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

  test('zooms about the viewport center and clamps the requested level', () => {
    const zoomed = zoomView(view, BOARD_ZOOM_FACTOR)
    expect(zoomed.zoom).toBe(BOARD_ZOOM_FACTOR)
    expect(zoomed.pan).toEqual({ x: -125, y: -62.5 })
    expect(zoomView(view, 0).zoom).toBe(MIN_BOARD_ZOOM)
    expect(zoomView(view, Number.POSITIVE_INFINITY).zoom).toBe(MAX_BOARD_ZOOM)
    expect((keyToView(view, '+') as { kind: 'view'; view: typeof view }).view).toEqual(zoomed)
  })
})
