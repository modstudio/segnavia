import { describe, expect, test } from 'bun:test'
import type { BoardItem, Document } from '@segnavia/format'
import { Cover, MAX_BOARD_ZOOM, MIN_BOARD_ZOOM, resolveBrand } from '@segnavia/format'
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
import { pageDocument } from './page-document.test-helper.ts'

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
const documentInputForBoard = () => ({
  type: 'document' as const,
  kind: 'deck' as const,
  title: 'Deck',
  children: [{ type: 'slide' as const, id: 'slide', content: { kind: 'html' as const, html: '<p>Slide</p>' } }],
})

describe('board policy', () => {
  test.each([
    [
      { cover: { page: pageDocument('designed') }, picture: 'kept.webp' },
      { kind: 'picture', src: 'kept.webp' },
    ],
    [{ cover: { page: pageDocument('designed') } }, { kind: 'live', cover: expect.any(Object) }],
    [undefined, { kind: 'fallback' }],
  ] as const)('applies each ordered cover preference', (designed, expected) => {
    const parsed = designed ? { ...designed, cover: Cover.parse(designed.cover) } : undefined
    expect(coverPresentation(parsed)).toEqual(expected)
  })
  test('adapts every resolved board item to a shape fact', () => {
    type Resolved = Parameters<typeof boardItemFact>[0]
    const fact = (value: unknown) => boardItemFact(value as Resolved)
    expect(fact({ kind: 'image', width: 640, height: 480 })).toEqual({ kind: 'media', size: { width: 640, height: 480 } })
    expect(fact({ kind: 'shot', width: 1280, height: 720 })).toEqual({ kind: 'shot', size: { width: 1280, height: 720 } })
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
    expect(facts).toEqual({ asset: { kind: 'media', size: { width: 640, height: 480 } } })
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

  test('uses the board brand as a whole-item default and lets an item brand win whole', async () => {
    const source = {
      brand: async (name: string) => ({ tokens: { colors: { ink: name === 'item' ? '#222222' : '#111111' } } }),
    }
    const signal = new AbortController().signal
    const boardBrand = await source.brand('board')
    const itemBrand = await source.brand('item')
    const resolveItemBrand = async (document?: Document) => (document ? ((await resolveBrand(document, source, signal)) ?? boardBrand) : boardBrand)
    const item = (kind: BoardItem['kind']): BoardItem => ({ id: kind, kind, address: kind, x: 0, y: 0, width: 100 })
    const page = (brand?: string) => ({
      type: 'document' as const,
      kind: 'page' as const,
      brand,
      children: [{ type: 'page' as const, body: { html: '<p>Page</p>' } }],
    })

    const inheritedDeck = await checkResolved(item('deck'), { kind: 'deck', deck: documentInputForBoard() }, resolveItemBrand)
    const overriddenDeck = await checkResolved(item('deck'), { kind: 'deck', deck: { ...documentInputForBoard(), brand: 'item' } }, resolveItemBrand)
    expect(inheritedDeck.kind === 'deck' ? inheritedDeck.deck.brand : undefined).toEqual(boardBrand)
    expect(overriddenDeck.kind === 'deck' ? overriddenDeck.deck.brand : undefined).toEqual(itemBrand)

    const inheritedPage = await checkResolved(item('page'), { kind: 'page', page: page(), size: { width: 10, height: 20 } }, resolveItemBrand)
    const overriddenPage = await checkResolved(item('page'), { kind: 'page', page: page('item'), size: { width: 10, height: 20 } }, resolveItemBrand)
    expect(inheritedPage.kind === 'page' ? inheritedPage.page.brand : undefined).toEqual(boardBrand)
    expect(overriddenPage.kind === 'page' ? overriddenPage.page.brand : undefined).toEqual(itemBrand)

    const inheritedPaper = await checkResolved(
      item('paper'),
      { kind: 'paper', pages: [page(), page()], imposition, size: { width: 10, height: 20 } },
      resolveItemBrand,
    )
    const overriddenPaper = await checkResolved(
      item('paper'),
      { kind: 'paper', pages: [page('item')], imposition, size: { width: 10, height: 20 } },
      resolveItemBrand,
    )
    expect(inheritedPaper.kind === 'paper' ? inheritedPaper.pages.map((value) => value.brand) : []).toEqual([boardBrand, boardBrand])
    expect(overriddenPaper.kind === 'paper' ? overriddenPaper.pages[0]?.brand : undefined).toEqual(itemBrand)

    const inheritedBook = await checkResolved(item('book'), { kind: 'book', view: { html: '' }, size: { width: 10, height: 20 } }, resolveItemBrand)
    const overriddenBook = await checkResolved(
      item('book'),
      { kind: 'book', view: { html: '', brand: itemBrand }, size: { width: 10, height: 20 } },
      resolveItemBrand,
    )
    expect(inheritedBook.kind === 'book' ? inheritedBook.view.brand : undefined).toEqual(boardBrand)
    expect(overriddenBook.kind === 'book' ? overriddenBook.view.brand : undefined).toEqual(itemBrand)
  })

  test('refuses a resolved board item document of the wrong kind', () => {
    const deckItem: BoardItem = { id: 'deck', kind: 'deck', address: 'deck', x: 0, y: 0, width: 100 }
    expect(() =>
      checkResolved(deckItem, {
        kind: 'deck',
        deck: { type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '' } }] },
      }),
    ).toThrow('resolved board item "deck" has document kind page, not deck; return kind deck to clear this refusal')
  })

  test('returns a parsed cover without changing the host value', () => {
    const designedCover = { cover: { page: pageDocument('cover') } }
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
      designedCover: { cover: { page: pageDocument('', 'sandboxed') } },
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
