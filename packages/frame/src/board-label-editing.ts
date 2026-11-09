import { type Board, type BoardView, boardToScreen, labelDirection, type Point } from '@segnavia/format'

export function labelResizeHandlePoint(label: Board['labels'][number], view: BoardView, shape: { width: number; height: number }): Point {
  const point = boardToScreen(view, label)
  return {
    x: point.x + (labelDirection(label) === 'ltr' ? shape.width * view.zoom : 0),
    y: point.y + (shape.height * view.zoom) / 2,
  }
}
