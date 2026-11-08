import { applyOps, type Document, type DocumentBatch, type DocumentOp, diffDocuments, fingerprintDocument, invertOps, rebaseOps } from '@segnavia/format'
import type { BoardEdit } from './board-editing.ts'
import {
  appendBoardHistory,
  type BoardHistory,
  type BoardHistoryEntry,
  emptyBoardHistory,
  rebaseBoardHistory,
  redoBoardHistory,
  undoBoardHistory,
} from './board-history.ts'

export interface PendingBoardEdit {
  id: number
  before: Document
  after: Document
  ops: readonly DocumentOp[]
  edit: BoardEdit
  historyBefore: BoardHistory<BoardEdit>
}
export interface BoardEditQueueState extends BoardHistory<BoardEdit> {
  value: Document
  jobs: readonly PendingBoardEdit[]
  invalidated: Pick<PendingBoardEdit, 'id' | 'edit'> | null
  nextId: number
}
export interface BoardEditEffects {
  show?: Document
  run?: PendingBoardEdit
  abort: readonly number[]
  error?: { edit: BoardEdit; error: unknown }
  historyChanged: boolean
}
export interface BoardEditTransition {
  state: BoardEditQueueState
  effects: BoardEditEffects
  conflicts?: readonly DocumentOp[]
}

const availability = (state: BoardHistory<BoardEdit>): string => `${state.undo.length > 0}:${state.redo.length > 0}`
const unchanged = (state: BoardEditQueueState): BoardEditTransition => ({ state, effects: { abort: [], historyChanged: false } })

export function boardEditQueue(value: Document, nextId = 1, invalidated: BoardEditQueueState['invalidated'] = null): BoardEditQueueState {
  return { value, jobs: [], invalidated, ...emptyBoardHistory(), nextId }
}

function enqueue(
  state: BoardEditQueueState,
  after: Document,
  ops: readonly DocumentOp[],
  edit: BoardEdit,
  history: BoardHistory<BoardEdit>,
): BoardEditTransition {
  const job = { id: state.nextId, before: state.value, after, ops, edit, historyBefore: { undo: state.undo, redo: state.redo } }
  const next = { ...state, value: after, jobs: [...state.jobs, job], ...history, nextId: state.nextId + 1 }
  return {
    state: next,
    effects: { show: after, run: state.jobs.length === 0 ? job : undefined, abort: [], historyChanged: availability(state) !== availability(next) },
  }
}

export function applyBoardEdit(state: BoardEditQueueState, ops: readonly DocumentOp[], edit: BoardEdit): BoardEditTransition {
  const result = rebaseOps(state.value, ops)
  if (result.conflicts.length > 0) return { ...unchanged(state), conflicts: result.conflicts }
  const entry: BoardHistoryEntry<BoardEdit> = { ops: result.applied, inverse: invertOps(result.applied), edit }
  return enqueue(state, result.document, result.applied, edit, appendBoardHistory(state, entry))
}

export function undoBoardEdit(state: BoardEditQueueState): BoardEditTransition {
  const result = undoBoardHistory(state.value, state)
  if (!result.entry)
    return { state: { ...state, ...result.history }, effects: { abort: [], historyChanged: availability(state) !== availability(result.history) } }
  return enqueue(state, result.document, result.entry.inverse, { kind: 'undo', edit: result.entry.edit }, result.history)
}

export function redoBoardEdit(state: BoardEditQueueState): BoardEditTransition {
  const result = redoBoardHistory(state.value, state)
  if (!result.entry)
    return { state: { ...state, ...result.history }, effects: { abort: [], historyChanged: availability(state) !== availability(result.history) } }
  return enqueue(state, result.document, result.entry.ops, { kind: 'redo', edit: result.entry.edit }, result.history)
}

export function applyRemoteBoardEdit(state: BoardEditQueueState, batch: DocumentBatch): BoardEditTransition {
  const base = state.jobs[0]?.before ?? state.value
  const rebasedRemote = rebaseOps(base, batch.ops)
  if (rebasedRemote.conflicts.length > 0) return { ...unchanged(state), conflicts: rebasedRemote.conflicts }
  const remote = batch.base === fingerprintDocument(base) ? applyOps(base, batch) : rebasedRemote.document
  const kept: PendingBoardEdit[] = []
  const abort: number[] = []
  let working = remote
  for (const job of state.jobs) {
    const rebased = rebaseOps(working, job.ops)
    if (rebased.conflicts.length > 0) abort.push(job.id)
    else {
      kept.push({ ...job, before: working, after: rebased.document })
      working = rebased.document
    }
  }
  const history = rebaseBoardHistory(working, state)
  const next = { ...state, value: working, jobs: kept, ...history }
  return { state: next, effects: { show: working, abort, run: kept[0], historyChanged: availability(state) !== availability(next) } }
}

export function adoptHostBoard(state: BoardEditQueueState, value: Document): BoardEditTransition {
  if (state.value.id !== value.id || state.value.kind !== value.kind) {
    const next = boardEditQueue(value, state.nextId, state.invalidated)
    return {
      state: next,
      effects: {
        show: value,
        abort: state.jobs.map((job) => job.id),
        historyChanged: availability(state) !== availability(next),
      },
    }
  }
  const base = state.jobs[0]?.before ?? state.value
  return applyRemoteBoardEdit(state, { base: fingerprintDocument(base), ops: diffDocuments(base, value) })
}

export function resolveBoardEdit(state: BoardEditQueueState, id: number): BoardEditTransition {
  if (state.invalidated?.id === id) return { state: { ...state, invalidated: null }, effects: { abort: [], run: state.jobs[0], historyChanged: false } }
  const job = state.jobs[0]
  if (!job || job.id !== id) return unchanged(state)
  const jobs = state.jobs.slice(1)
  return { state: { ...state, jobs }, effects: { abort: [], run: jobs[0], historyChanged: false } }
}

export function rejectBoardEdit(state: BoardEditQueueState, id: number, error: unknown): BoardEditTransition {
  if (state.invalidated?.id === id)
    return {
      state: { ...state, invalidated: null },
      effects: { abort: [], run: state.jobs[0], error: { edit: state.invalidated.edit, error }, historyChanged: false },
    }
  const job = state.jobs[0]
  if (!job || job.id !== id) return unchanged(state)
  const next = { ...state, value: job.before, jobs: [], ...job.historyBefore }
  return {
    state: next,
    effects: {
      show: next.value,
      abort: state.jobs.slice(1).map((entry) => entry.id),
      error: { edit: job.edit, error },
      historyChanged: availability(state) !== availability(next),
    },
  }
}

export function detachBoardEditing(state: BoardEditQueueState): BoardEditTransition {
  return unchanged(state)
}
