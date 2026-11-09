import { describe, expect, test } from 'bun:test'
import type { Board, BoardLabel, BoardShapes, BoardView } from '@segnavia/format'
import { LABEL_MIN_WIDTH } from '@segnavia/format'
import { labelResizeHandlePoint, marqueeBoardNodes, moveBoardNodes, resizeBoardLabel } from './board-label-editing.ts'

const view: BoardView = { zoom: 2, pan: { x: 10, y: 20 }, viewport: { width: 800, height: 600 } }
const shapes: BoardShapes = { items: { item: { width: 4, height: 3 } }, labels: { latin: { width: 80, height: 20 }, hebrew: { width: 70, height: 38 } } }

function fixture(direction: Board['direction'] = 'ltr'): Board {
  return {
    title: 'Board',
    direction,
    items: [{ id: 'item', kind: 'page', address: 'page', x: 10, y: 20, width: 40 }],
    labels: [
      { id: 'latin', text: 'Latin', x: 100, y: 40 },
      { id: 'hebrew', text: 'עברית', x: 200, y: 80, width: 70, size: { width: 70, height: 38 } },
    ],
    sections: [],
  }
}

describe('board label movement', () => {
  test('moves selected items and labels by the same board delta', () => {
    const moved = moveBoardNodes(fixture(), ['item', 'hebrew'], { x: 4, y: -3 })
    expect(moved.items[0]).toMatchObject({ x: 14, y: 17 })
    expect(moved.labels[1]).toMatchObject({ x: 204, y: 77 })
    expect(moved.labels[0]).toMatchObject({ x: 100, y: 40 })
  })

  test('marquee returns touched items and labels in board order', () => {
    expect(marqueeBoardNodes(fixture(), { x: 0, y: 0 }, { x: 500, y: 260 }, view, shapes)).toEqual(['item', 'latin', 'hebrew'])
  })
})

describe('label resize', () => {
  test.each(['ltr', 'rtl'] as const)('puts each label handle on its own inline end on an %s board', (direction) => {
    const board = fixture(direction)
    expect(labelResizeHandlePoint(board.labels[0] as BoardLabel, view, shapes.labels.latin as { width: number; height: number })).toEqual({ x: 370, y: 120 })
    expect(labelResizeHandlePoint(board.labels[1] as BoardLabel, view, shapes.labels.hebrew as { width: number; height: number })).toEqual({ x: 410, y: 218 })
  })

  test('keeps an RTL label right edge fixed and clears its stale measurement', () => {
    const before = fixture('rtl')
    const resized = resizeBoardLabel(before, 'hebrew', { x: 370, y: 0 }, view, 70)
    expect(resized.labels[1]).toEqual({ id: 'hebrew', text: 'עברית', x: 180, y: 80, width: 90 })
    expect((resized.labels[1]?.x ?? 0) + (resized.labels[1]?.width ?? 0)).toBe(270)
  })

  test('clamps a crossed handle to the label minimum width', () => {
    const resized = resizeBoardLabel(fixture(), 'latin', { x: -100, y: 0 }, view, 80)
    expect(resized.labels[0]).toMatchObject({ x: 100, width: LABEL_MIN_WIDTH })
  })
})
