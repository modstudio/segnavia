import { type Board, type BoardShapes, boardFromDocument, diffDocuments, settleBoard } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import { applyBoardEdit, type BoardEditQueueState, type BoardEditTransition, redoBoardEdit, undoBoardEdit } from './board-edit-policy.ts'
import type { BoardEditingBridge } from './board-editing-seam.ts'
import type { BoardEdit } from './board-editing-types.ts'

export function applyBoardTransition(state: BoardEditQueueState, bridge: BoardEditingBridge, next: Board, edit: BoardEdit, recorded = true) {
  return applyBoardEdit(state, diffDocuments(state.value, bridge.document(next)), edit, { recorded })
}

export function commitLiveTransition(state: BoardEditQueueState, bridge: BoardEditingBridge, before: Board, next: Board, edit: BoardEdit) {
  bridge.setOptimistic(before)
  return applyBoardTransition({ ...state, value: bridge.document(before) }, bridge, next, edit)
}

function existingIds(edit: BoardEdit, value: Board): string[] {
  const ids = edit.kind === 'undo' || edit.kind === 'redo' ? existingIds(edit.edit, value) : edit.ids
  const present = new Set([...value.items, ...value.labels].map((node) => node.id))
  return ids.filter((id) => present.has(id))
}

export function undoTransition(state: BoardEditQueueState) {
  const entry = state.undo.at(-1)
  if (!entry) return undefined
  const transition = undoBoardEdit(state)
  return { transition, selection: existingIds(entry.edit, boardFromDocument(transition.state.value)) }
}

export function redoTransition(state: BoardEditQueueState) {
  const entry = state.redo.at(-1)
  if (!entry) return undefined
  const transition = redoBoardEdit(state)
  return { transition, selection: existingIds(entry.edit, boardFromDocument(transition.state.value)) }
}

export function initialBoardSettlement(
  board: Board,
  measured: Readonly<Record<string, { width: number; height: number }>>,
  shapes: BoardShapes,
): Board | undefined {
  const labels = board.labels.map((label) => (label.size || !measured[label.id] ? label : { ...label, size: measured[label.id] }))
  const sized = labels.some((label, index) => label !== board.labels[index]) ? { ...board, labels } : board
  const settled = settleBoard(
    board,
    sized,
    shapes,
    board.sections.map((section) => section.id),
  )
  return JSON.stringify(settled) === JSON.stringify(board) ? undefined : settled
}

interface TransitionTarget {
  board: SegnaviaBoard
  bridge: BoardEditingBridge
  aborts: Map<number, AbortController>
  setState(state: BoardEditQueueState): void
  render(): void
  refreshLabelEditor(): void
  notifyHistory(): void
  run(id: number): void
}

export function applyEditingTransition(target: TransitionTarget, transition: BoardEditTransition, selection?: readonly string[]) {
  target.setState(transition.state)
  for (const job of transition.state.jobs) if (!target.aborts.has(job.id)) target.aborts.set(job.id, new AbortController())
  for (const id of transition.effects.abort) {
    target.aborts.get(id)?.abort()
    target.aborts.delete(id)
  }
  if (transition.effects.show) target.bridge.setOptimistic(boardFromDocument(transition.effects.show))
  if (selection) target.board.selection = selection
  if (transition.effects.historyChanged) target.notifyHistory()
  if (transition.effects.error)
    target.board.dispatchEvent(new CustomEvent('segnavia-board-edit-error', { detail: transition.effects.error, bubbles: true, composed: true }))
  target.render()
  target.refreshLabelEditor()
  if (transition.effects.run) target.run(transition.effects.run.id)
}
