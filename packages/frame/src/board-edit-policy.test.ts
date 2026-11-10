import { describe, expect, test } from 'bun:test'
import {
  type Board,
  boardFromDocument,
  boardShapes,
  type Document,
  type DocumentOp,
  Document as DocumentSchema,
  diffDocuments,
  documentFromBoard,
  fingerprintDocument,
} from '@segnavia/format'
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
import { BoardEditingController } from './board-editing.ts'
import { editBoardFromFrame, prepareBoardApply } from './board-editing-command.ts'

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
const labelBoard = (title: string, labels: Board['labels'] = []): Document =>
  documentFromBoard(
    { title, direction: 'ltr', items: [], labels, sections: [] },
    DocumentSchema.parse({ type: 'document', id: 'labels', kind: 'board', title, settings: { dir: 'ltr' }, children: [] }),
  )

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

  test('an unrecorded local edit is queued but rebased out of undo history', () => {
    const applied = resolveBoardEdit(apply(boardEditQueue(value(0)), value(1)).state, 1).state
    const settled = applyBoardEdit(applied, diffDocuments(value(1), value(1, 'Settled')), { kind: 'settle', ids: [] }, { recorded: false })
    expect(settled.state.value).toEqual(value(1, 'Settled'))
    expect(settled.state.jobs).toHaveLength(1)
    expect(settled.state.undo).toHaveLength(1)
    const undone = undoBoardEdit(resolveBoardEdit(settled.state, 2).state)
    expect(undone.state.value).toEqual(value(0, 'Settled'))
  })

  test('one undo removes a command-added label and its measurement while preserving attach settlement', () => {
    const initial = labelBoard('Initial')
    const settled = applyBoardEdit(boardEditQueue(initial), diffDocuments(initial, labelBoard('Settled')), { kind: 'settle', ids: [] }, { recorded: false })
    const afterSettle = resolveBoardEdit(settled.state, 1).state
    const board = boardFromDocument(afterSettle.value)
    const result = editBoardFromFrame(afterSettle.value, [{ type: 'label-add', id: 'label', text: 'New' }], {
      computedShapes: () => boardShapes(board, {}),
      facts: () => ({}),
      measureLabel: () => ({ width: 48, height: 20 }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const commandDocument = documentFromBoard(result.board, afterSettle.value)
    const command = applyBoardEdit(afterSettle, diffDocuments(afterSettle.value, commandDocument), { kind: 'command', label: 'add label', ids: ['label'] })
    expect(command.state.undo).toHaveLength(1)
    expect(command.state.value.children.find((node) => node.id === 'label')).toMatchObject({ size: { width: 48, height: 20 } })
    const undone = undoBoardEdit(resolveBoardEdit(command.state, 2).state)
    expect(undone.state.undo).toHaveLength(0)
    expect(undone.state.value.title).toBe('Settled')
    expect(undone.state.value.children.some((node) => node.id === 'label')).toBe(false)
  })

  test('host apply records an unsized label-add and its measured size as one entry', () => {
    const before = labelBoard('Board')
    const added = labelBoard('Board', [{ id: 'label', text: 'New', x: 10, y: 20 }])
    const prepared = prepareBoardApply(
      before,
      diffDocuments(before, added),
      () => ({ width: 48, height: 20 }),
      (board) => documentFromBoard(board, added),
    )
    const transition = applyBoardEdit(boardEditQueue(before), prepared.applied, { kind: 'apply', label: 'add label', ids: [] })
    expect(transition.state.undo).toHaveLength(1)
    expect(transition.state.jobs[0]?.ops).toContainEqual(
      expect.objectContaining({ type: 'setFields', id: 'label', fields: { size: { width: 48, height: 20 } } }),
    )
    expect(transition.state.value.children.find((node) => node.id === 'label')).toMatchObject({ size: { width: 48, height: 20 } })
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

  test('controller apply refuses a partly conflicting batch without changing document or queues', () => {
    const initial = value(1, 'Current')
    const state = boardEditQueue(initial)
    const controller = Object.create(BoardEditingController.prototype) as BoardEditingController
    const internals = controller as unknown as {
      state: typeof state
      bridge: {
        measureLabel: () => undefined
        document: (board: Board) => Document
      }
    }
    internals.state = state
    internals.bridge = {
      measureLabel: () => undefined,
      document: (board) => documentFromBoard(board, initial),
    }
    const valid = diffDocuments(initial, value(1, 'Remote'))
    const conflicting = diffDocuments(value(0), value(2)).filter((op) => op.type === 'setFields' && op.id === 'one')
    const mixed = [...valid, ...conflicting]

    expect(() => controller.apply(mixed, 'mixed batch')).toThrow(
      'Board edit refused conflicting operations: setFields node one field x. Rebuild the batch against the current board.',
    )
    expect(internals.state).toBe(state)
    expect(internals.state.value).toBe(initial)
    expect(internals.state.jobs).toEqual([])
    expect(internals.state.undo).toEqual([])
    expect(internals.state.redo).toEqual([])
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
