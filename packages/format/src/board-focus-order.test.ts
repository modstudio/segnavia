import { describe, expect, test } from 'bun:test'
import { boardFocusOrder } from './board-focus-order.ts'
import type { Board, BoardShapes } from './index.ts'

const shapes: BoardShapes = {
  items: { a: { width: 1, height: 1 }, b: { width: 1, height: 1 }, c: { width: 1, height: 1 } },
  labels: {
    inside: { width: 20, height: 10 },
    outside: { width: 20, height: 10 },
    right: { width: 20, height: 10 },
    left: { width: 20, height: 10 },
    below: { width: 20, height: 10 },
  },
}

function fixture(direction: Board['direction']): Board {
  return {
    title: 'Board',
    direction,
    items: [
      { id: 'a', kind: 'page', address: 'a', x: 0, y: 0, width: 10 },
      { id: 'b', kind: 'page', address: 'b', x: 0, y: 0, width: 10 },
      { id: 'c', kind: 'page', address: 'c', x: 0, y: 0, width: 10 },
    ],
    labels: [
      { id: 'outside', text: 'Outside', x: 400, y: 0 },
      { id: 'inside', text: 'Inside', x: 20, y: 20 },
      { id: 'left', text: 'שמאל', x: 240, y: 20 },
      { id: 'right', text: 'ימין', x: 280, y: 20 },
      { id: 'below', text: 'למטה', x: 260, y: 60 },
    ],
    sections: [
      { id: 'section', title: 'Section', rectangle: { x: 0, y: 0, width: 100, height: 100 }, items: ['b', 'a'] },
      { id: 'empty', title: 'Empty', rectangle: { x: 500, y: 0, width: 100, height: 100 }, items: [] },
      { id: 'hebrew', title: 'עברית', rectangle: { x: 200, y: 0, width: 120, height: 100 }, items: [] },
    ],
  }
}

describe('boardFocusOrder', () => {
  test('places section titles, members and contained labels before loose entries', () => {
    expect(boardFocusOrder(fixture('ltr'), shapes)).toEqual(['section', 'b', 'a', 'inside', 'empty', 'hebrew', 'left', 'right', 'below', 'c', 'outside'])
  })

  test('orders Hebrew labels from the inline start on an rtl board', () => {
    expect(boardFocusOrder(fixture('rtl'), shapes)).toEqual(['section', 'b', 'a', 'inside', 'empty', 'hebrew', 'right', 'left', 'below', 'c', 'outside'])
  })
})
