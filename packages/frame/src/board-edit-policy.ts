import type { Board } from '@segnavia/format'
import type { BoardEdit } from './board-editing.ts'

export interface PendingBoardEdit {
  id: number
  before: Board
  after: Board
  edit: BoardEdit
}

export interface BoardEditQueueState {
  value: Board
  pending: readonly PendingBoardEdit[]
  generation: number
}

export function enqueueBoardEdit(state: BoardEditQueueState, edit: BoardEdit, after: Board, id: number): BoardEditQueueState {
  return { ...state, value: after, pending: [...state.pending, { id, before: state.value, after, edit }] }
}

export function resolveBoardEdit(state: BoardEditQueueState, id: number): BoardEditQueueState {
  return { ...state, pending: state.pending.filter((entry) => entry.id !== id) }
}

export function rejectBoardEdit(state: BoardEditQueueState, id: number): BoardEditQueueState {
  const failed = state.pending.find((entry) => entry.id === id)
  if (!failed) return state
  return { ...state, value: failed.before, pending: state.pending.filter((entry) => entry.id < id) }
}

export function adoptHostBoard(state: BoardEditQueueState, value: Board): BoardEditQueueState {
  return { value, pending: [], generation: state.generation + 1 }
}
