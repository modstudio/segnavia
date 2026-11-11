import { expect, test } from 'bun:test'
import type { Board, BoardShapes } from '@segnavia/format'
import { revealTarget } from './board-reveal.ts'

const board: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [{ id: 'item', kind: 'page', address: 'item', x: 10, y: 20, width: 100 }],
  labels: [{ id: 'label', text: 'Label', x: 30, y: 40 }],
  sections: [{ id: 'section', title: 'Section', rectangle: { x: 0, y: 0, width: 200, height: 150 }, items: ['item'] }],
}
const shapes: BoardShapes = { items: { item: { width: 2, height: 1 } }, labels: { label: { width: 60, height: 20 } } }

test('resolves item, label and section reveal boxes', () => {
  expect(revealTarget(board, shapes, 'item')).toEqual({
    kind: 'item',
    item: board.items[0] as Board['items'][number],
    bounds: { x: 10, y: 20, width: 100, height: 50 },
  })
  expect(revealTarget(board, shapes, 'label')).toEqual({ kind: 'label', bounds: { x: 30, y: 40, width: 60, height: 20 } })
  expect(revealTarget(board, shapes, 'section')).toEqual({ kind: 'section', bounds: { x: 0, y: 0, width: 200, height: 150 } })
  expect(revealTarget(board, shapes, 'missing')).toBeUndefined()
})
