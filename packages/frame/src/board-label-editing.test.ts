import { describe, expect, test } from 'bun:test'
import type { Board, BoardLabel, BoardShapes, BoardView } from '@segnavia/format'
import { committedLabelText, labelResizeHandlePoint } from './board-label-editing.ts'

const view: BoardView = { zoom: 2, pan: { x: 10, y: 20 }, viewport: { width: 800, height: 600 } }
const shapes: BoardShapes = { items: { item: { width: 4, height: 3 } }, labels: { latin: { width: 80, height: 20 }, hebrew: { width: 70, height: 38 } } }

function fixture(): Board {
  return {
    title: 'Board',
    direction: 'rtl',
    items: [{ id: 'item', kind: 'page', address: 'page', x: 10, y: 20, width: 40 }],
    labels: [
      { id: 'latin', text: 'Latin', x: 100, y: 40 },
      { id: 'hebrew', text: 'עברית', x: 200, y: 80, width: 70, size: { width: 70, height: 38 } },
    ],
    sections: [],
  }
}

describe('label resize', () => {
  test("puts each label handle on the label's own inline-end edge", () => {
    const board = fixture()
    expect(labelResizeHandlePoint(board.labels[0] as BoardLabel, view, shapes.labels.latin as { width: number; height: number })).toEqual({ x: 370, y: 120 })
    expect(labelResizeHandlePoint(board.labels[1] as BoardLabel, view, shapes.labels.hebrew as { width: number; height: number })).toEqual({ x: 410, y: 218 })
  })
})

describe('label text editing', () => {
  test.each([
    ['unchanged text', 'Old text', 'Old text', undefined],
    ['empty text', 'Old text', '', undefined],
    ['whitespace-only text', 'Old text', ' \n\t', undefined],
    ['changed text', 'Old text', 'New text', 'New text'],
    ['changed Hebrew text', 'עברית', 'עברית חדשה', 'עברית חדשה'],
  ])('%s', (_name, oldText, newText, expected) => {
    expect(committedLabelText(oldText, newText)).toBe(expected)
  })
})
