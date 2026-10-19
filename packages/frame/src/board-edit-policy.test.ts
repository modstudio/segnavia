import { describe, expect, test } from 'bun:test'
import type { Board } from '@segnavia/format'
import {
  adoptHostBoard,
  applyBoardEdit,
  boardEditQueue,
  detachBoardEditing,
  redoBoardEdit,
  rejectBoardEdit,
  resolveBoardEdit,
  undoBoardEdit,
} from './board-edit-policy.ts'

const value = (x: number): Board => ({
  title: 'Board',
  direction: 'ltr',
  items: [{ id: 'one', kind: 'deck', address: 'one', x, y: 0, width: 100 }],
  labels: [],
  sections: [],
})

describe('board edit queue policy', () => {
  test('keeps optimistic queued values and rolls a rejection back past later edits', () => {
    let state = boardEditQueue(value(0))
    state = applyBoardEdit(state, value(1), { kind: 'move', ids: ['one'] }).state
    state = applyBoardEdit(state, value(2), { kind: 'move', ids: ['one'] }).state
    expect(rejectBoardEdit(state, 1, 'no').state).toMatchObject({ value: value(0), jobs: [], undo: [], redo: [] })
    expect(resolveBoardEdit(state, 1).state).toMatchObject({ value: value(2), jobs: [{ id: 2 }], undo: [{ after: value(1) }, { after: value(2) }] })
  })

  test('a host value aborts pending work and makes its late completion inert', async () => {
    const queued = applyBoardEdit(boardEditQueue(value(0)), value(1), { kind: 'move', ids: ['one'] }).state
    const controller = new AbortController()
    let finish!: () => void
    const write = new Promise<void>((resolve) => {
      finish = resolve
    })
    const adopted = adoptHostBoard(queued, value(9))
    for (const id of adopted.effects.abort) if (id === 1) controller.abort()
    finish()
    await write
    const late = resolveBoardEdit(adopted.state, 1)
    expect(controller.signal.aborted).toBe(true)
    expect(late.state).toMatchObject({ value: value(9), jobs: [], invalidated: null, undo: [], redo: [], generation: 1 })
    expect(late.effects.show).toBeUndefined()
  })

  test('a host value keeps a late rejection error without restoring stale work', () => {
    const queued = applyBoardEdit(boardEditQueue(value(0)), value(1), { kind: 'move', ids: ['one'] }).state
    const adopted = adoptHostBoard(queued, value(9))
    const late = rejectBoardEdit(adopted.state, 1, 'write failed')
    expect(late.state).toMatchObject({ value: value(9), jobs: [], invalidated: null, undo: [], redo: [] })
    expect(late.effects).toMatchObject({ error: { edit: { kind: 'move', ids: ['one'] }, error: 'write failed' } })
    expect(late.effects.show).toBeUndefined()
  })

  test('detach leaves signals active and queued jobs run in order', () => {
    let state = boardEditQueue(value(0))
    state = applyBoardEdit(state, value(1), { kind: 'move', ids: ['one'] }).state
    state = applyBoardEdit(state, value(2), { kind: 'move', ids: ['one'] }).state
    const controllers = new Map([
      [1, new AbortController()],
      [2, new AbortController()],
    ])
    const detached = detachBoardEditing(state)
    for (const id of detached.effects.abort) controllers.get(id)?.abort()
    expect(detached.state).toBe(state)
    expect([...controllers.values()].some((controller) => controller.signal.aborted)).toBe(false)
    expect(resolveBoardEdit(detached.state, 1).effects.run).toMatchObject({ id: 2 })
    expect(rejectBoardEdit(detached.state, 1, 'failed').state).toMatchObject({ value: value(0), jobs: [], undo: [], redo: [] })
  })

  test('undo and redo are queued with rollback snapshots', () => {
    const applied = applyBoardEdit(boardEditQueue(value(0)), value(1), { kind: 'move', ids: ['one'] }).state
    const settled = resolveBoardEdit(applied, 1).state
    const undone = undoBoardEdit(settled)
    expect(undone.state).toMatchObject({ value: value(0), undo: [], redo: [{ after: value(1) }], jobs: [{ edit: { kind: 'undo' } }] })
    const redone = redoBoardEdit(resolveBoardEdit(undone.state, 2).state)
    expect(redone.state).toMatchObject({ value: value(1), undo: [{ after: value(1) }], redo: [], jobs: [{ edit: { kind: 'redo' } }] })
    expect(rejectBoardEdit(redone.state, 3, 'no').state).toMatchObject({ value: value(0), undo: [], redo: [{ after: value(1) }] })
  })
})
