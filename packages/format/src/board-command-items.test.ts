import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { BOARD_COMMAND_HANDLERS, DEFAULT_BOARD_ITEM_WIDTH } from './board-command-items.ts'

const board: Board = { title: 'B', direction: 'ltr', items: [], labels: [], sections: [] }

describe('board item command handlers', () => {
  test('the dispatch table covers the five item-slice verbs', () => {
    expect(Object.keys(BOARD_COMMAND_HANDLERS).sort()).toEqual(['arrange', 'item-add', 'item-move', 'item-remove', 'item-resize'])
    expect(DEFAULT_BOARD_ITEM_WIDTH).toBe(320)
  })

  test('item-add owns its default width', () => {
    const result = BOARD_COMMAND_HANDLERS['item-add'](
      {
        board,
        shapes: { items: {}, labels: {} },
        provisional: new Set(),
        estimated: new Set(),
        options: { facts: { page: { kind: 'page', size: { width: 2, height: 1 } } } },
        command: 0,
      },
      { type: 'item-add', id: 'a', kind: 'page', address: 'page', target: { free: true } },
    )
    expect(result.board.items[0]?.width).toBe(DEFAULT_BOARD_ITEM_WIDTH)
  })
})
