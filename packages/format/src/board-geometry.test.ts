import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import {
  arrange,
  type BoardShapes,
  boardBounds,
  boardToScreen,
  itemAt,
  itemHeight,
  MAX_BOARD_ZOOM,
  MIN_BOARD_ZOOM,
  screenToBoard,
  visibleItems,
  zoomAt,
  zoomToFit,
} from './board-geometry.ts'

const itemA: Board['items'][number] = { id: 'a', kind: 'deck', address: 'a', x: 20, y: 20, width: 100 }
const shapeA = { width: 200, height: 100 }
const firstSection: Board['sections'][number] = {
  id: 'section',
  title: 'First',
  rectangle: { x: 10, y: 10, width: 130, height: 100 },
  items: ['a', 'b'],
}

const board: Board = {
  title: 'Geometry',
  direction: 'ltr',
  items: [itemA, { id: 'b', kind: 'page', address: 'b', x: 60, y: 40, width: 50 }, { id: 'c', kind: 'image', address: 'c', x: 200, y: 30, width: 80 }],
  labels: [{ id: 'label', text: 'Label', x: -20, y: -10 }],
  sections: [firstSection],
}

const shapes: BoardShapes = {
  items: {
    a: shapeA,
    b: { width: 50, height: 50 },
    c: { width: 200, height: 100 },
  },
  labels: { label: { width: 40, height: 10 } },
}

describe('board geometry', () => {
  test('uses the supplied intrinsic aspect ratio for item height', () => {
    expect(itemHeight(itemA, shapeA)).toBe(50)
  })

  test('bounds include items, measured labels and sections', () => {
    expect(boardBounds(board, shapes)).toEqual({ x: -20, y: -10, width: 300, height: 120 })
  })

  test('missing item and label shapes refuse with the missing id', () => {
    expect(() => boardBounds(board, { ...shapes, items: {} })).toThrow('item "a" has no supplied shape')
    expect(() => boardBounds(board, { ...shapes, labels: {} })).toThrow('label "label" has no supplied shape')
  })

  test.each(['toString', 'constructor', '__proto__'])('prototype-named item id %s still requires a supplied shape', (id) => {
    expect(() => boardBounds({ ...board, items: [{ ...itemA, id }], labels: [], sections: [] }, { items: {}, labels: {} })).toThrow(
      `item "${id}" has no supplied shape`,
    )
  })

  test.each(['toString', 'constructor', '__proto__'])('prototype-named label id %s still requires a supplied shape', (id) => {
    expect(() => boardBounds({ ...board, items: [], labels: [{ id, text: 'Label', x: 0, y: 0 }], sections: [] }, { items: {}, labels: {} })).toThrow(
      `label "${id}" has no supplied shape`,
    )
  })

  test('screen and board conversion round trip at the fitted zoom', () => {
    const view = zoomToFit({ x: 10, y: 20, width: 200, height: 100 }, { width: 500, height: 300 }, 20)
    const point = { x: 83, y: 47 }
    expect(screenToBoard(view, boardToScreen(view, point))).toEqual(point)
    const topLeft = boardToScreen(view, { x: 10, y: 20 })
    expect(topLeft.x).toBeCloseTo(20)
    expect(topLeft.y).toBeCloseTo(35)
  })

  test('zoomAt keeps the screen point fixed and clamps to exported bounds', () => {
    const view = { zoom: 2, pan: { x: 30, y: -10 }, viewport: { width: 800, height: 600 } }
    const cursor = { x: 230, y: 190 }
    const boardPoint = screenToBoard(view, cursor)
    const zoomed = zoomAt(view, cursor, 1.5)
    expect(zoomed.zoom).toBe(3)
    expect(boardToScreen(zoomed, boardPoint)).toEqual(cursor)
    expect(zoomAt(view, cursor, 0.001).zoom).toBe(MIN_BOARD_ZOOM)
    expect(zoomAt(view, cursor, 100).zoom).toBe(MAX_BOARD_ZOOM)
    expect(zoomAt(view, cursor, 100, { minZoom: 1, maxZoom: 4 }).zoom).toBe(4)
  })

  test('visibility includes items touching viewport and margin edges', () => {
    const edgeBoard: Board = {
      ...board,
      items: [
        { ...itemA, id: 'right', x: 100, y: 20, width: 20 },
        { ...itemA, id: 'outside', x: 111, y: 20, width: 20 },
        { ...itemA, id: 'left', x: -20, y: 20, width: 20 },
      ],
      labels: [],
      sections: [],
    }
    const edgeShapes = { items: { right: shapeA, outside: shapeA, left: shapeA }, labels: {} }
    const view = { zoom: 1, pan: { x: 0, y: 0 }, viewport: { width: 100, height: 100 } }
    expect(visibleItems(edgeBoard, edgeShapes, view, 10).map((item) => item.id)).toEqual(['right', 'left'])
    expect(visibleItems(edgeBoard, edgeShapes, view, 11).map((item) => item.id)).toEqual(['right', 'outside', 'left'])
  })

  test('hit testing returns the last item in list order', () => {
    expect(itemAt(board, shapes, { x: 70, y: 50 })?.id).toBe('b')
    expect(itemAt(board, shapes, { x: 500, y: 500 })).toBeUndefined()
  })
})

describe('board arrange', () => {
  test.each([
    [
      'ltr',
      'grid',
      [
        { x: 0, y: 0 },
        { x: 110, y: 0 },
        { x: 0, y: 60 },
      ],
    ],
    [
      'rtl',
      'grid',
      [
        { x: -100, y: 0 },
        { x: -160, y: 0 },
        { x: -80, y: 60 },
      ],
    ],
    [
      'ltr',
      'row',
      [
        { x: 0, y: 0 },
        { x: 110, y: 0 },
        { x: 170, y: 0 },
      ],
    ],
    [
      'rtl',
      'row',
      [
        { x: -100, y: 0 },
        { x: -160, y: 0 },
        { x: -250, y: 0 },
      ],
    ],
  ] as const)('arranges %s items in a %s', (direction, layout, expected) => {
    const arranged = arrange({ ...board, direction, sections: [] }, shapes, { layout, gap: 10, columns: layout === 'grid' ? 2 : undefined })
    expect(arranged.items.map(({ x, y }) => ({ x, y }))).toEqual([...expected])
    expect(arranged.items.map((item) => item.width)).toEqual([100, 50, 80])
  })

  test('a grid without columns uses the square-root default', () => {
    const arranged = arrange({ ...board, sections: [] }, shapes, { layout: 'grid', gap: 10 })
    expect(arranged.items.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 0, y: 0 },
      { x: 110, y: 0 },
      { x: 0, y: 60 },
    ])
  })

  test.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5])('refuses invalid explicit grid columns: %s', (columns) => {
    expect(() => arrange(board, shapes, { layout: 'grid', gap: 10, columns })).toThrow('columns')
    expect(() => arrange(board, shapes, { layout: 'grid', gap: 10, columns })).toThrow('provide a positive integer')
  })

  test('labels stay untouched and sections enclose arranged members with explicit padding', () => {
    const arranged = arrange(board, shapes, { layout: 'row', gap: 10, sectionPadding: 5 })
    expect(arranged.labels).toBe(board.labels)
    expect(arranged.sections[0]?.rectangle).toEqual({ x: -5, y: -5, width: 170, height: 60 })
  })

  test('section padding defaults to the arrangement gap and empty sections stay untouched', () => {
    const empty = { id: 'empty', title: 'Empty', rectangle: { x: 3, y: 4, width: 5, height: 6 }, items: [] }
    const arranged = arrange({ ...board, sections: [firstSection, empty] }, shapes, { layout: 'row', gap: 10 })
    expect(arranged.sections[0]?.rectangle).toEqual({ x: -10, y: -10, width: 180, height: 70 })
    expect(arranged.sections[1]).toBe(empty)
  })
})
