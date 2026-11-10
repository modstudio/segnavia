import {
  type Board,
  type BoardCommand,
  type BoardEditResult,
  type BoardItemAnchor,
  type BoardShapesOptions,
  boardFromDocument,
  type Document,
  type DocumentOp,
  diffDocuments,
  editBoard,
  labelShape,
  rebaseOps,
} from '@segnavia/format'
import type { BoardEditingBridge } from './board-editing-seam.ts'
import { sizeMeasuredLabels } from './board-label-sizing.ts'

export const resizeAnchors: Record<string, BoardItemAnchor> = {
  'top-left': 'bottom-right',
  'top-right': 'bottom-left',
  'bottom-left': 'top-right',
  'bottom-right': 'top-left',
}

export function prepareBoardApply(
  before: Document,
  ops: readonly DocumentOp[],
  measureLabel: NonNullable<BoardShapesOptions['measureLabel']>,
  document: (board: Board) => Document,
): ReturnType<typeof rebaseOps> {
  const rebased = rebaseOps(before, ops)
  if (rebased.conflicts.length > 0) return rebased
  const previous = new Map(boardFromDocument(before).labels.map((label) => [label.id, label]))
  const board = boardFromDocument(rebased.document)
  const candidates = board.labels.map((label) => {
    const old = previous.get(label.id)
    const sizeChanged = old && (old.size?.width !== label.size?.width || old.size?.height !== label.size?.height)
    return old && (old.text !== label.text || old.width !== label.width) && !sizeChanged ? { ...label, size: undefined } : label
  })
  const labels = sizeMeasuredLabels(candidates, (label) => labelShape(label, measureLabel))
  const measured = labels.some((label, index) => label !== board.labels[index]) ? document({ ...board, labels }) : rebased.document
  return { ...rebased, document: measured, applied: [...rebased.applied, ...diffDocuments(rebased.document, measured)] }
}

export function editBoardFromFrame(
  document: Document,
  commands: BoardCommand[],
  geometry: Pick<BoardEditingBridge, 'computedShapes' | 'facts' | 'measureLabel'>,
): BoardEditResult {
  return editBoard(document, commands, geometry.computedShapes(), { facts: geometry.facts(), measureLabel: geometry.measureLabel })
}

export function resizeReleaseCommand(board: Board, id: string, corner: string): BoardCommand | undefined {
  const item = board.items.find((entry) => entry.id === id)
  const anchor = resizeAnchors[corner]
  if (!item || !anchor) return undefined
  const logical =
    board.direction === 'ltr'
      ? { 'top-left': 'top-start', 'top-right': 'top-end', 'bottom-left': 'bottom-start', 'bottom-right': 'bottom-end' }
      : { 'top-left': 'top-end', 'top-right': 'top-start', 'bottom-left': 'bottom-end', 'bottom-right': 'bottom-start' }
  return {
    type: 'item-resize',
    item: { id },
    width: item.width,
    anchor: logical[anchor] as NonNullable<Extract<BoardCommand, { type: 'item-resize' }>['anchor']>,
  }
}

export function labelResizeReleaseCommand(board: Board, id: string): BoardCommand | undefined {
  const label = board.labels.find((entry) => entry.id === id)
  return label?.width === undefined ? undefined : { type: 'label-set', label: { id }, width: label.width, target: { at: { x: label.x, y: label.y } } }
}
