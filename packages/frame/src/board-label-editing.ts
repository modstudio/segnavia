import {
  type Board,
  type BoardShapes,
  type BoardView,
  boardToScreen,
  labelDirection,
  labelXForWidth,
  type MeasuredSize,
  type Point,
  withLabelWidth,
} from '@segnavia/format'

export function committedLabelText(oldText: string, newText: string): string | undefined {
  return newText !== oldText && newText.trim().length > 0 ? newText : undefined
}

export type LabelDoubleClickTarget = { kind: 'handle' | 'label'; id: string }

export function labelDoubleClickTarget(
  handleId: string | undefined,
  labelId: string | undefined,
  captured?: LabelDoubleClickTarget,
): LabelDoubleClickTarget | undefined {
  if (handleId) return { kind: 'handle', id: handleId }
  if (labelId) return { kind: 'label', id: labelId }
  return captured
}

export function labelResizeHandlePoint(label: Board['labels'][number], view: BoardView, shape: { width: number; height: number }): Point {
  const point = boardToScreen(view, label)
  return {
    x: point.x + (labelDirection(label) === 'ltr' ? shape.width * view.zoom : 0),
    y: point.y + (shape.height * view.zoom) / 2,
  }
}

export function withoutLabelWidth(
  board: Board | null,
  id: string,
  shapes: BoardShapes,
  labelShape: (label: Board['labels'][number]) => MeasuredSize,
): Board | undefined {
  const label = board?.labels.find((entry) => entry.id === id)
  const currentWidth = shapes.labels[id]?.width
  if (!board || !label || label.width === undefined || currentWidth === undefined) return undefined
  const unwrapped = withLabelWidth(label, undefined)
  const anchored = { ...unwrapped, x: labelXForWidth(label, currentWidth, labelShape(unwrapped).width) }
  return { ...board, labels: board.labels.map((entry) => (entry.id === id ? anchored : entry)) }
}
