import { describe, expect, test } from 'bun:test'
import type { Canvas } from './canvas.ts'
import {
  arrange,
  type CanvasShapes,
  canvasBounds,
  canvasToScreen,
  itemAt,
  itemHeight,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  screenToCanvas,
  visibleItems,
  zoomAt,
  zoomToFit,
} from './canvas-geometry.ts'

const itemA: Canvas['items'][number] = { id: 'a', kind: 'deck', address: 'a', x: 20, y: 20, width: 100 }
const shapeA = { width: 200, height: 100 }
const firstSection: Canvas['sections'][number] = {
  id: 'section',
  title: 'First',
  rectangle: { x: 10, y: 10, width: 130, height: 100 },
  items: ['a', 'b'],
}

const canvas: Canvas = {
  title: 'Geometry',
  direction: 'ltr',
  items: [itemA, { id: 'b', kind: 'page', address: 'b', x: 60, y: 40, width: 50 }, { id: 'c', kind: 'image', address: 'c', x: 200, y: 30, width: 80 }],
  labels: [{ id: 'label', text: 'Label', x: -20, y: -10 }],
  sections: [firstSection],
}

const shapes: CanvasShapes = {
  items: {
    a: shapeA,
    b: { width: 50, height: 50 },
    c: { width: 200, height: 100 },
  },
  labels: { label: { width: 40, height: 10 } },
}

describe('canvas geometry', () => {
  test('uses the supplied intrinsic aspect ratio for item height', () => {
    expect(itemHeight(itemA, shapeA)).toBe(50)
  })

  test('bounds include items, measured labels and sections', () => {
    expect(canvasBounds(canvas, shapes)).toEqual({ x: -20, y: -10, width: 300, height: 120 })
  })

  test('missing item and label shapes refuse with the missing id', () => {
    expect(() => canvasBounds(canvas, { ...shapes, items: {} })).toThrow('item "a" has no supplied shape')
    expect(() => canvasBounds(canvas, { ...shapes, labels: {} })).toThrow('label "label" has no supplied shape')
  })

  test.each(['toString', 'constructor', '__proto__'])('prototype-named item and label id %s still requires a supplied shape', (id) => {
    expect(() => canvasBounds({ ...canvas, items: [{ ...itemA, id }], labels: [], sections: [] }, { items: {}, labels: {} })).toThrow(
      `item "${id}" has no supplied shape`,
    )
    expect(() => canvasBounds({ ...canvas, items: [], labels: [{ id, text: 'Label', x: 0, y: 0 }], sections: [] }, { items: {}, labels: {} })).toThrow(
      `label "${id}" has no supplied shape`,
    )
  })

  test('screen and canvas conversion round trip at the fitted zoom', () => {
    const view = zoomToFit({ x: 10, y: 20, width: 200, height: 100 }, { width: 500, height: 300 }, 20)
    const point = { x: 83, y: 47 }
    expect(screenToCanvas(view, canvasToScreen(view, point))).toEqual(point)
    const topLeft = canvasToScreen(view, { x: 10, y: 20 })
    expect(topLeft.x).toBeCloseTo(20)
    expect(topLeft.y).toBeCloseTo(35)
  })

  test('zoomAt keeps the screen point fixed and clamps to exported bounds', () => {
    const view = { zoom: 2, pan: { x: 30, y: -10 }, viewport: { width: 800, height: 600 } }
    const cursor = { x: 230, y: 190 }
    const canvasPoint = screenToCanvas(view, cursor)
    const zoomed = zoomAt(view, cursor, 1.5)
    expect(zoomed.zoom).toBe(3)
    expect(canvasToScreen(zoomed, canvasPoint)).toEqual(cursor)
    expect(zoomAt(view, cursor, 0.001).zoom).toBe(MIN_CANVAS_ZOOM)
    expect(zoomAt(view, cursor, 100).zoom).toBe(MAX_CANVAS_ZOOM)
    expect(zoomAt(view, cursor, 100, { minZoom: 1, maxZoom: 4 }).zoom).toBe(4)
  })

  test('visibility includes items touching viewport and margin edges', () => {
    const edgeCanvas: Canvas = {
      ...canvas,
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
    expect(visibleItems(edgeCanvas, edgeShapes, view, 10).map((item) => item.id)).toEqual(['right', 'left'])
    expect(visibleItems(edgeCanvas, edgeShapes, view, 11).map((item) => item.id)).toEqual(['right', 'outside', 'left'])
  })

  test('hit testing returns the last item in list order', () => {
    expect(itemAt(canvas, shapes, { x: 70, y: 50 })?.id).toBe('b')
    expect(itemAt(canvas, shapes, { x: 500, y: 500 })).toBeUndefined()
  })
})

describe('canvas arrange', () => {
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
    const arranged = arrange({ ...canvas, direction, sections: [] }, shapes, { layout, gap: 10, columns: layout === 'grid' ? 2 : undefined })
    expect(arranged.items.map(({ x, y }) => ({ x, y }))).toEqual([...expected])
    expect(arranged.items.map((item) => item.width)).toEqual([100, 50, 80])
  })

  test('a grid without columns uses the square-root default', () => {
    const arranged = arrange({ ...canvas, sections: [] }, shapes, { layout: 'grid', gap: 10 })
    expect(arranged.items.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 0, y: 0 },
      { x: 110, y: 0 },
      { x: 0, y: 60 },
    ])
  })

  test.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5])('refuses invalid explicit grid columns: %s', (columns) => {
    expect(() => arrange(canvas, shapes, { layout: 'grid', gap: 10, columns })).toThrow('columns')
    expect(() => arrange(canvas, shapes, { layout: 'grid', gap: 10, columns })).toThrow('provide a positive integer')
  })

  test('labels stay untouched and sections enclose arranged members with explicit padding', () => {
    const arranged = arrange(canvas, shapes, { layout: 'row', gap: 10, sectionPadding: 5 })
    expect(arranged.labels).toBe(canvas.labels)
    expect(arranged.sections[0]?.rectangle).toEqual({ x: -5, y: -5, width: 170, height: 60 })
  })

  test('section padding defaults to the arrangement gap and empty sections stay untouched', () => {
    const empty = { id: 'empty', title: 'Empty', rectangle: { x: 3, y: 4, width: 5, height: 6 }, items: [] }
    const arranged = arrange({ ...canvas, sections: [firstSection, empty] }, shapes, { layout: 'row', gap: 10 })
    expect(arranged.sections[0]?.rectangle).toEqual({ x: -10, y: -10, width: 180, height: 70 })
    expect(arranged.sections[1]).toBe(empty)
  })
})
