import { describe, expect, test } from 'bun:test'
import { type Document, type DocumentOp, Document as DocumentSchema, diffDocuments, fingerprintDocument } from '@segnavia/format'
import {
  adoptHostBoard,
  applyBoardEdit,
  applyRemoteBoardEdit,
  boardEditQueue,
  boardEditRefusal,
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

  test('mid-queue host adoption lands exactly and aborts the conflicting job', () => {
    const pending = apply(boardEditQueue(value(0)), value(1)).state
    const adopted = adoptHostBoard(pending, value(5))
    expect(adopted.state.value).toEqual(value(5))
    expect(adopted.state.jobs).toEqual([])
    expect(adopted.effects.abort).toEqual([1])
  })

  test('a non-conflicting queued job is kept and rebased around a host adoption', () => {
    const pending = apply(boardEditQueue(value(0)), value(1)).state
    const adopted = adoptHostBoard(pending, value(0, 'Host'))
    expect(adopted.state.value).toEqual(value(1, 'Host'))
    expect(adopted.state.jobs).toHaveLength(1)
    expect(adopted.state.jobs[0]?.before).toEqual(value(0, 'Host'))
    expect(adopted.state.jobs[0]?.after).toEqual(value(1, 'Host'))
    expect(adopted.effects.abort).toEqual([])
    expect(adopted.effects.run?.id).toBe(1)
  })

  test('a host document with a different identity starts a fresh session', () => {
    const pending = apply(boardEditQueue(value(0)), value(1)).state
    const differentId = DocumentSchema.parse({ ...value(8), id: 'replacement' })
    const adopted = adoptHostBoard(pending, differentId)
    expect(adopted.state).toMatchObject({ value: differentId, jobs: [], undo: [], redo: [], nextId: 2 })
    expect(adopted.effects).toMatchObject({ show: differentId, abort: [1] })
  })

  test('host apply and applyRemote expose conflicts without applying part of a batch', () => {
    const current = boardEditQueue(value(1, 'Current'))
    const staleOps = diffDocuments(value(0), value(2, 'Remote'))
    const applied = applyBoardEdit(current, staleOps, { kind: 'apply', label: 'host', ids: [] })
    const remote = applyRemoteBoardEdit(current, { base: fingerprintDocument(value(0)), ops: staleOps })
    expect(applied.conflicts).toEqual(staleOps)
    expect(remote.conflicts).toEqual(staleOps)
    expect(boardEditRefusal(remote.conflicts ?? [])).toBe(
      'Board edit refused conflicting operations: setFields node board field title; setFields node one field x. Rebuild the batch against the current board.',
    )
    expect(applied.state).toBe(current)
    expect(remote.state).toBe(current)
  })

  test('conflict refusals name setFields nodes and fields', () => {
    const op: DocumentOp = { type: 'setFields', id: 'one', fields: { x: 2 }, unset: [], prior: { x: 0 }, priorAbsent: [] }
    const transition = applyBoardEdit(boardEditQueue(value(1)), [op], { kind: 'apply', label: 'host', ids: [] })
    expect(boardEditRefusal(transition.conflicts ?? [])).toBe(
      'Board edit refused conflicting operations: setFields node one field x. Rebuild the batch against the current board.',
    )
  })

  test('conflict refusals name setMember sections and items', () => {
    const op: DocumentOp = { type: 'setMember', section: 'section-one', item: 'one', from: null, to: { after: null } }
    const transition = applyBoardEdit(boardEditQueue(value(0)), [op], { kind: 'apply', label: 'host', ids: [] })
    expect(boardEditRefusal(transition.conflicts ?? [])).toBe(
      'Board edit refused conflicting operations: setMember section section-one item one. Rebuild the batch against the current board.',
    )
  })
})
