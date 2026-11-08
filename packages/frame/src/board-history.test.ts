import { describe, expect, test } from 'bun:test'
import { type Document, Document as DocumentSchema, diffDocuments, invertOps } from '@segnavia/format'
import {
  appendBoardHistory,
  BOARD_HISTORY_LIMIT,
  type BoardHistory,
  emptyBoardHistory,
  rebaseBoardHistory,
  redoBoardHistory,
  undoBoardHistory,
} from './board-history.ts'

function board(x = 0, title = 'Board'): Document {
  return DocumentSchema.parse({
    type: 'document',
    id: 'board',
    kind: 'board',
    title,
    settings: { dir: 'ltr' },
    children: [{ type: 'item', id: 'a', kind: 'page', address: 'a', x, y: 0, width: 10 }],
  })
}

function entry(before: Document, after: Document, edit: string) {
  const ops = diffDocuments(before, after)
  return { ops, inverse: invertOps(ops), edit }
}

describe('board history', () => {
  test('caps undo entries and clears redo on append', () => {
    const held = entry(board(), board(1), 'move')
    let history: BoardHistory<string> = { undo: [], redo: [held] }
    for (let index = 0; index <= BOARD_HISTORY_LIMIT; index += 1) history = appendBoardHistory(history, { ...held, edit: `${index}` })
    expect(history.undo).toHaveLength(BOARD_HISTORY_LIMIT)
    expect(history.redo).toEqual([])
  })

  test('undo and redo apply inverse and forward ops', () => {
    const before = board()
    const after = board(4)
    const history = appendBoardHistory(emptyBoardHistory<string>(), entry(before, after, 'move'))
    const undone = undoBoardHistory(after, history)
    expect(undone.document).toEqual(before)
    expect(undone.entry?.edit).toBe('move')
    const redone = redoBoardHistory(undone.document, undone.history)
    expect(redone.document).toEqual(after)
  })

  test('drops a conflicting entry whole and updates availability', () => {
    const before = board()
    const after = board(4)
    const remote = board(8)
    const history = appendBoardHistory(emptyBoardHistory<string>(), entry(before, after, 'move'))
    const rebased = rebaseBoardHistory(remote, history)
    expect(rebased.undo).toEqual([])
    expect(rebased.redo).toEqual([])
  })

  test('keeps older entries by checking undo in stack order', () => {
    const first = entry(board(), board(4), 'first')
    const second = entry(board(4), board(8), 'second')
    const history = { undo: [first, second], redo: [] }
    expect(rebaseBoardHistory(board(8, 'Remote title'), history).undo).toEqual([first, second])
  })
})
