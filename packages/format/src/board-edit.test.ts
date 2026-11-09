import { describe, expect, test } from 'bun:test'
import {
  addItem,
  type Board,
  type BoardItem,
  LABEL_MIN_WIDTH,
  MIN_BOARD_ITEM_WIDTH,
  moveBoardNodes,
  moveItems,
  moveSection,
  removeItems,
  resizeItem,
  resizeLabel,
  withLabelWidth,
} from './index.ts'

const board: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [
    { id: 'one', kind: 'deck', address: 'one', x: 10, y: 20, width: 100 },
    { id: 'two', kind: 'page', address: 'two', x: 200, y: 30, width: 80 },
  ],
  labels: [{ id: 'label', text: 'עברית', x: 300, y: 40, width: 80, size: { width: 80, height: 40 } }],
  sections: [{ id: 'section', title: 'Section', rectangle: { x: 0, y: 0, width: 300, height: 200 }, items: ['one'] }],
}

describe('board edits', () => {
  test('moves items and sections without changing the input', () => {
    expect(moveItems(board, ['one'], { x: 4, y: -2 }).items[0]).toMatchObject({ x: 14, y: 18 })
    const moved = moveSection(board, 'section', { x: 5, y: 6 })
    expect(moved.items[0]).toMatchObject({ x: 15, y: 26 })
    expect(moved.sections[0]?.rectangle).toMatchObject({ x: 5, y: 6 })
    expect(board.items[0]).toMatchObject({ x: 10, y: 20 })
  })

  test('moves selected items and labels by the same delta', () => {
    const moved = moveBoardNodes(board, ['one', 'label'], { x: 4, y: -3 })
    expect(moved.items[0]).toMatchObject({ x: 14, y: 17 })
    expect(moved.labels[0]).toMatchObject({ x: 304, y: 37 })
  })

  test('resizes around each fixed corner and clamps width', () => {
    expect(resizeItem(board, 'one', 120, 'bottom-right', (width) => width / 2).items[0]).toMatchObject({ x: -10, y: 10, width: 120 })
    expect(resizeItem(board, 'one', 4, 'top-left', (width) => width / 2).items[0]?.width).toBe(MIN_BOARD_ITEM_WIDTH)
  })

  test('resizes an RTL label around its inline-start edge and clears its measurement', () => {
    const resized = resizeLabel(board, 'label', 280, 80)
    expect(resized.labels[0]).toEqual({ id: 'label', text: 'עברית', x: 280, y: 40, width: 100 })
    expect((resized.labels[0]?.x ?? 0) + (resized.labels[0]?.width ?? 0)).toBe(380)
  })

  test('clamps a crossed label handle and centralizes width removal', () => {
    expect(resizeLabel(board, 'label', 500, 80).labels[0]).toMatchObject({ x: 380 - LABEL_MIN_WIDTH, width: LABEL_MIN_WIDTH })
    expect(withLabelWidth(board.labels[0] as NonNullable<(typeof board.labels)[number]>, undefined)).toEqual({
      id: 'label',
      text: 'עברית',
      x: 300,
      y: 40,
    })
  })

  test('removes membership and validates additions', () => {
    const removed = removeItems(board, ['one'])
    expect(removed.items.map((item) => item.id)).toEqual(['two'])
    expect(removed.sections[0]?.items).toEqual([])
    const item: BoardItem = { id: 'three', kind: 'book', address: 'three', x: 0, y: 0, width: 100 }
    expect(addItem(board, item).items.at(-1)).toEqual(item)
    expect(() => addItem(board, { ...item, id: 'one' })).toThrow()
  })
})
