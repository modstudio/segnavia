import type { Board } from '@segnavia/format'
import type { BoardEdit } from './board-editing.ts'

export const BOARD_HISTORY_LIMIT = 100

export interface BoardHistoryEntry {
  before: Board
  after: Board
  edit: BoardEdit
}

export interface PendingBoardEdit {
  id: number
  generation: number
  before: Board
  after: Board
  edit: BoardEdit
  undoBefore: readonly BoardHistoryEntry[]
  redoBefore: readonly BoardHistoryEntry[]
}

export interface BoardEditQueueState {
  value: Board
  jobs: readonly PendingBoardEdit[]
  invalidated: Pick<PendingBoardEdit, 'id' | 'edit'> | null
  undo: readonly BoardHistoryEntry[]
  redo: readonly BoardHistoryEntry[]
  generation: number
  nextId: number
}

export interface BoardEditEffects {
  show?: Board
  run?: PendingBoardEdit
  abort: readonly number[]
  error?: { edit: BoardEdit; error: unknown }
  historyChanged: boolean
}

export interface BoardEditTransition {
  state: BoardEditQueueState
  effects: BoardEditEffects
}

export function boardEditQueue(value: Board): BoardEditQueueState {
  return { value, jobs: [], invalidated: null, undo: [], redo: [], generation: 0, nextId: 1 }
}

export function applyBoardEdit(state: BoardEditQueueState, after: Board, edit: BoardEdit): BoardEditTransition {
  const undo = [...state.undo, { before: state.value, after, edit }].slice(-BOARD_HISTORY_LIMIT)
  return enqueue(state, after, edit, state.undo, state.redo, undo, [])
}

export function undoBoardEdit(state: BoardEditQueueState): BoardEditTransition {
  const entry = state.undo.at(-1)
  if (!entry) return unchanged(state)
  return enqueue(state, entry.before, { kind: 'undo', edit: entry.edit }, state.undo, state.redo, state.undo.slice(0, -1), [...state.redo, entry])
}

export function redoBoardEdit(state: BoardEditQueueState): BoardEditTransition {
  const entry = state.redo.at(-1)
  if (!entry) return unchanged(state)
  return enqueue(
    state,
    entry.after,
    { kind: 'redo', edit: entry.edit },
    state.undo,
    state.redo,
    [...state.undo, entry].slice(-BOARD_HISTORY_LIMIT),
    state.redo.slice(0, -1),
  )
}

export function resolveBoardEdit(state: BoardEditQueueState, id: number): BoardEditTransition {
  if (state.invalidated?.id === id) return { state: { ...state, invalidated: null }, effects: { abort: [], historyChanged: false } }
  const job = state.jobs[0]
  if (!job || job.id !== id || job.generation !== state.generation) return unchanged(state)
  const jobs = state.jobs.slice(1)
  return { state: { ...state, jobs }, effects: { abort: [], run: jobs[0], historyChanged: false } }
}

export function rejectBoardEdit(state: BoardEditQueueState, id: number, error: unknown): BoardEditTransition {
  if (state.invalidated?.id === id) {
    const edit = state.invalidated.edit
    return { state: { ...state, invalidated: null }, effects: { abort: [], error: { edit, error }, historyChanged: false } }
  }
  const job = state.jobs[0]
  if (!job || job.id !== id || job.generation !== state.generation) return unchanged(state)
  const next = { ...state, value: job.before, jobs: [], undo: job.undoBefore, redo: job.redoBefore }
  return {
    state: next,
    effects: {
      show: next.value,
      abort: state.jobs.slice(1).map((entry) => entry.id),
      error: { edit: job.edit, error },
      historyChanged: historyAvailability(state) !== historyAvailability(next),
    },
  }
}

export function adoptHostBoard(state: BoardEditQueueState, value: Board): BoardEditTransition {
  const invalidated = state.invalidated ?? (state.jobs[0] ? { id: state.jobs[0].id, edit: state.jobs[0].edit } : null)
  const next = { ...state, value, jobs: [], invalidated, undo: [], redo: [], generation: state.generation + 1 }
  return {
    state: next,
    effects: {
      show: value,
      abort: state.jobs.map((job) => job.id),
      historyChanged: historyAvailability(state) !== historyAvailability(next),
    },
  }
}

export function detachBoardEditing(state: BoardEditQueueState): BoardEditTransition {
  return { state, effects: { abort: [], historyChanged: false } }
}

function enqueue(
  state: BoardEditQueueState,
  after: Board,
  edit: BoardEdit,
  undoBefore: readonly BoardHistoryEntry[],
  redoBefore: readonly BoardHistoryEntry[],
  undo: readonly BoardHistoryEntry[],
  redo: readonly BoardHistoryEntry[],
): BoardEditTransition {
  const job: PendingBoardEdit = {
    id: state.nextId,
    generation: state.generation,
    before: state.value,
    after,
    edit,
    undoBefore,
    redoBefore,
  }
  const next = { ...state, value: after, jobs: [...state.jobs, job], undo, redo, nextId: state.nextId + 1 }
  return {
    state: next,
    effects: {
      show: after,
      run: state.jobs.length === 0 ? job : undefined,
      abort: [],
      historyChanged: historyAvailability(state) !== historyAvailability(next),
    },
  }
}

function unchanged(state: BoardEditQueueState): BoardEditTransition {
  return { state, effects: { abort: [], historyChanged: false } }
}

function historyAvailability(state: BoardEditQueueState): string {
  return `${state.undo.length > 0}:${state.redo.length > 0}`
}
