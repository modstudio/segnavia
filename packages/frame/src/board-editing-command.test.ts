import { describe, expect, test } from 'bun:test'
import { type Board, type BoardCommand, type BoardShapes, Document, type Document as DocumentValue, documentFromBoard } from '@segnavia/format'
import { editBoardFromFrame } from './board-editing-command.ts'
import { resizeReleaseCommand } from './board-editing-overlay.ts'

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
const shapes: BoardShapes = { items: { a: { width: 1, height: 1 }, b: { width: 1, height: 1 } }, labels: {} }
const empty = Document.parse({ type: 'document', kind: 'board', title: 'Board', settings: { dir: 'ltr' }, children: [] })
const document = (value: Board = board): DocumentValue => documentFromBoard(value, empty)

function success(command: BoardCommand, value: Board = board) {
  const result = editBoardFromFrame(document(value), [command], shapes)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.refusal)
  return result.board
}

describe('board editing release commands', () => {
  test('removes through editBoard', () => {
    expect(success({ type: 'item-remove', items: [{ id: 'a' }] }).items.map((item) => item.id)).toEqual(['b'])
  })

  test('resizes a pointer release through editBoard', () => {
    const resized = { ...board, items: board.items.map((item) => (item.id === 'a' ? { ...item, width: 140 } : item)) }
    const command = resizeReleaseCommand(resized, 'a', 'bottom-right')
    if (!command) throw new Error('resize command was not built')
    expect(success(command).items[0]?.width).toBe(140)
  })

  test('returns a command refusal without changing the document', () => {
    const result = editBoardFromFrame(document(), [{ type: 'item-remove', items: [{ id: 'missing' }] }], shapes)
    expect(result).toMatchObject({ ok: false })
    if (result.ok) throw new Error('missing item was accepted')
    expect(result.refusal).toMatch(/Nothing was changed/)
  })
})
