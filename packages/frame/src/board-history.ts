import { type Document, type DocumentOp, rebaseOps } from '@segnavia/format'

export const BOARD_HISTORY_LIMIT = 100

export interface BoardHistoryEntry<Edit> {
  ops: readonly DocumentOp[]
  inverse: readonly DocumentOp[]
  edit: Edit
}

export interface BoardHistory<Edit> {
  undo: readonly BoardHistoryEntry<Edit>[]
  redo: readonly BoardHistoryEntry<Edit>[]
}

export interface BoardHistoryResult<Edit> {
  document: Document
  history: BoardHistory<Edit>
  entry?: BoardHistoryEntry<Edit>
  conflicts: readonly DocumentOp[]
}

export function emptyBoardHistory<Edit>(): BoardHistory<Edit> {
  return { undo: [], redo: [] }
}

export function appendBoardHistory<Edit>(history: BoardHistory<Edit>, entry: BoardHistoryEntry<Edit>): BoardHistory<Edit> {
  return { undo: [...history.undo, entry].slice(-BOARD_HISTORY_LIMIT), redo: [] }
}

export function undoBoardHistory<Edit>(document: Document, history: BoardHistory<Edit>): BoardHistoryResult<Edit> {
  const entry = history.undo.at(-1)
  if (!entry) return { document, history, conflicts: [] }
  const result = rebaseOps(document, entry.inverse)
  const undo = history.undo.slice(0, -1)
  if (result.conflicts.length > 0) return { document, history: { ...history, undo }, conflicts: result.conflicts }
  return { document: result.document, history: { undo, redo: [...history.redo, entry] }, entry, conflicts: [] }
}

export function redoBoardHistory<Edit>(document: Document, history: BoardHistory<Edit>): BoardHistoryResult<Edit> {
  const entry = history.redo.at(-1)
  if (!entry) return { document, history, conflicts: [] }
  const result = rebaseOps(document, entry.ops)
  const redo = history.redo.slice(0, -1)
  if (result.conflicts.length > 0) return { document, history: { ...history, redo }, conflicts: result.conflicts }
  return {
    document: result.document,
    history: { undo: [...history.undo, entry].slice(-BOARD_HISTORY_LIMIT), redo },
    entry,
    conflicts: [],
  }
}

function compatibleEntries<Edit>(document: Document, entries: readonly BoardHistoryEntry<Edit>[], direction: 'inverse' | 'ops'): BoardHistoryEntry<Edit>[] {
  let probe = document
  const kept: BoardHistoryEntry<Edit>[] = []
  for (const entry of [...entries].reverse()) {
    const result = rebaseOps(probe, entry[direction])
    if (result.conflicts.length > 0) continue
    probe = result.document
    kept.unshift(entry)
  }
  return kept
}

export function rebaseBoardHistory<Edit>(document: Document, history: BoardHistory<Edit>): BoardHistory<Edit> {
  return {
    undo: compatibleEntries(document, history.undo, 'inverse'),
    redo: compatibleEntries(document, history.redo, 'ops'),
  }
}
