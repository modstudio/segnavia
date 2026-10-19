import { describe, expect, test } from 'bun:test'
import { addItem, type Board, type BoardItem, MIN_BOARD_ITEM_WIDTH, moveItems, moveSection, removeItems, resizeItem } from './index.ts'

const board: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [
    { id: 'one', kind: 'deck', address: 'one', x: 10, y: 20, width: 100 },
    { id: 'two', kind: 'page', address: 'two', x: 200, y: 30, width: 80 },
  ],
  labels: [],
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

  test('resizes around each fixed corner and clamps width', () => {
    expect(resizeItem(board, 'one', 120, 'bottom-right', (width) => width / 2).items[0]).toMatchObject({ x: -10, y: 10, width: 120 })
    expect(resizeItem(board, 'one', 4, 'top-left', (width) => width / 2).items[0]?.width).toBe(MIN_BOARD_ITEM_WIDTH)
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
