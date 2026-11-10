import { describe, expect, test } from 'bun:test'
import type { Board } from '@segnavia/format'
import { resizeReleaseCommand } from './board-editing-command.ts'

const board: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [
    { id: 'a', kind: 'page', address: 'a', x: 10, y: 20, width: 100 },
    { id: 'b', kind: 'page', address: 'b', x: 300, y: 20, width: 100 },
  ],
  labels: [],
  sections: [],
}
describe('board editing release commands', () => {
  test('maps each dragged corner to the fixed logical anchor in both directions', () => {
    const resized = { ...board, items: board.items.map((item) => (item.id === 'a' ? { ...item, width: 140 } : item)) }
    const expected = {
      ltr: {
        'bottom-right': 'top-start',
        'bottom-left': 'top-end',
        'top-right': 'bottom-start',
        'top-left': 'bottom-end',
      },
      rtl: {
        'bottom-right': 'top-end',
        'bottom-left': 'top-start',
        'top-right': 'bottom-end',
        'top-left': 'bottom-start',
      },
    } as const
    for (const direction of ['ltr', 'rtl'] as const) {
      for (const [corner, anchor] of Object.entries(expected[direction])) {
        expect(resizeReleaseCommand({ ...resized, direction }, 'a', corner)).toMatchObject({ anchor, width: 140 })
      }
    }
  })
})
