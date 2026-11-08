import { describe, expect, test } from 'bun:test'
import { type Document, Document as DocumentSchema, diffDocuments, fingerprintDocument } from '@segnavia/format'
import {
  adoptHostBoard,
  applyBoardEdit,
  applyRemoteBoardEdit,
  boardEditQueue,
  redoBoardEdit,
  rejectBoardEdit,
  resolveBoardEdit,
  undoBoardEdit,
} from './board-edit-policy.ts'

const value = (x: number, title = 'Board'): Document =>
  DocumentSchema.parse({
    type: 'document',
    id: 'board',
    kind: 'board',
    title,
    settings: { dir: 'ltr' },
    children: [{ type: 'item', id: 'one', kind: 'page', address: 'one', x, y: 0, width: 100 }],
  })

const edit = { kind: 'move' as const, ids: ['one'] }
const apply = (state: ReturnType<typeof boardEditQueue>, after: Document) => applyBoardEdit(state, diffDocuments(state.value, after), edit)

describe('board edit queue policy', () => {
  test('queues optimistic ops and rolls rejection back', () => {
    const first = apply(boardEditQueue(value(0)), value(1)).state
    const second = apply(first, value(2)).state
    expect(resolveBoardEdit(second, 1).state.jobs).toHaveLength(1)
    expect(rejectBoardEdit(second, 1, 'no').state).toMatchObject({ value: value(0), jobs: [], undo: [], redo: [] })
  })

  test('undo and redo queue inverse and forward operations', () => {
    const applied = resolveBoardEdit(apply(boardEditQueue(value(0)), value(1)).state, 1).state
    const undone = undoBoardEdit(applied)
    expect(undone.state.value).toEqual(value(0))
    expect(undone.state.redo).toHaveLength(1)
    const redone = redoBoardEdit(resolveBoardEdit(undone.state, 2).state)
    expect(redone.state.value).toEqual(value(1))
  })

  test('a stale remote batch keeps unrelated history and sends no job', () => {
    const applied = resolveBoardEdit(apply(boardEditQueue(value(0)), value(1)).state, 1).state
    const remote = value(1, 'Remote')
    const transition = applyRemoteBoardEdit(applied, { base: fingerprintDocument(value(0)), ops: diffDocuments(value(1), remote) })
    expect(transition.state.value).toEqual(remote)
    expect(transition.state.undo).toHaveLength(1)
    expect(transition.effects.run).toBeUndefined()
  })

  test('whole-document host adoption uses the remote path', () => {
    const applied = resolveBoardEdit(apply(boardEditQueue(value(0)), value(1)).state, 1).state
    const adopted = adoptHostBoard(applied, value(1, 'Host'))
    expect(adopted.state.undo).toHaveLength(1)
    expect(adopted.state.value).toEqual(value(1, 'Host'))
  })
})
