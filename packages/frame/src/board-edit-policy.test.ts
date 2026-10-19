import { describe, expect, test } from 'bun:test'
import type { Board } from '@segnavia/format'
import { adoptHostBoard, type BoardEditQueueState, enqueueBoardEdit, rejectBoardEdit, resolveBoardEdit } from './board-edit-policy.ts'

const value = (x: number): Board => ({
  title: 'Board',
  direction: 'ltr',
  items: [{ id: 'one', kind: 'deck', address: 'one', x, y: 0, width: 100 }],
  labels: [],
  sections: [],
})

describe('board edit queue policy', () => {
  test('keeps optimistic queued values and rolls a rejection back past later edits', () => {
    let state: BoardEditQueueState = { value: value(0), pending: [], generation: 0 }
    state = enqueueBoardEdit(state, { kind: 'move', ids: ['one'] }, value(1), 1)
    state = enqueueBoardEdit(state, { kind: 'move', ids: ['one'] }, value(2), 2)
    expect(rejectBoardEdit(state, 1)).toMatchObject({ value: value(0), pending: [] })
    expect(resolveBoardEdit(state, 1)).toMatchObject({ value: value(2), pending: [{ id: 2 }] })
  })

  test('a host value clears pending work and makes a later rejection inert', () => {
    const queued = enqueueBoardEdit({ value: value(0), pending: [], generation: 0 }, { kind: 'move', ids: ['one'] }, value(1), 1)
    const adopted = adoptHostBoard(queued, value(9))
    expect(rejectBoardEdit(adopted, 1)).toBe(adopted)
    expect(adopted).toMatchObject({ value: value(9), pending: [], generation: 1 })
  })
})
