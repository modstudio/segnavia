import {
  type Board,
  type BoardCommand,
  type BoardEditResult,
  type BoardItemAnchor,
  type BoardItemFact,
  type BoardShapesOptions,
  boardFromDocument,
  type ComputedBoardShapes,
  type Document,
  editBoard,
  labelShape,
} from '@segnavia/format'

export const resizeAnchors: Record<string, BoardItemAnchor> = {
  'top-left': 'bottom-right',
  'top-right': 'bottom-left',
  'bottom-left': 'top-right',
  'bottom-right': 'top-left',
}

export function measureAddedLabels(
  before: Document,
  after: Document,
  measureLabel: NonNullable<BoardShapesOptions['measureLabel']>,
  document: (board: Board) => Document,
): Document {
  const present = new Set(boardFromDocument(before).labels.map((label) => label.id))
  const board = boardFromDocument(after)
  const labels = board.labels.map((label) => {
    if (present.has(label.id) || label.size) return label
    const measured = labelShape(label, measureLabel)
    return measured.source === 'measured' ? { ...label, size: measured.shape } : label
  })
  return labels.some((label, index) => label !== board.labels[index]) ? document({ ...board, labels }) : after
}

export function editBoardFromFrame(
  document: Document,
  commands: BoardCommand[],
  shapes: ComputedBoardShapes,
  facts: Readonly<Record<string, BoardItemFact>>,
  measureLabel: NonNullable<BoardShapesOptions['measureLabel']>,
): BoardEditResult {
  return editBoard(document, commands, shapes, { facts, measureLabel })
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
