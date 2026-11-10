import { type Board, type BoardCommand, type BoardEditResult, type BoardItemAnchor, type BoardShapes, type Document, editBoard } from '@segnavia/format'

export const resizeAnchors: Record<string, BoardItemAnchor> = {
  'top-left': 'bottom-right',
  'top-right': 'bottom-left',
  'bottom-left': 'top-right',
  'bottom-right': 'top-left',
}

export function editBoardFromFrame(document: Document, commands: BoardCommand[], shapes: BoardShapes): BoardEditResult {
  return editBoard(document, commands, { shapes, provisional: [], estimated: [] })
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
