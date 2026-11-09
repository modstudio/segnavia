import {
  type Board,
  type BoardShapes,
  type BoardView,
  boardToScreen,
  LABEL_MIN_WIDTH,
  labelDirection,
  labelXForWidth,
  moveItems,
  type Point,
  screenToBoard,
} from '@segnavia/format'

export function labelResizeHandlePoint(label: Board['labels'][number], view: BoardView, shape: { width: number; height: number }): Point {
  const point = boardToScreen(view, label)
  return {
    x: point.x + (labelDirection(label) === 'ltr' ? shape.width * view.zoom : 0),
    y: point.y + (shape.height * view.zoom) / 2,
  }
}

export function moveBoardNodes(board: Board, ids: readonly string[], delta: Point): Board {
  const moved = moveItems(board, [...ids], delta)
  const selected = new Set(ids)
  return {
    ...moved,
    labels: moved.labels.map((label) => (selected.has(label.id) ? { ...label, x: label.x + delta.x, y: label.y + delta.y } : label)),
  }
}

export function resizeBoardLabel(board: Board, id: string, point: Point, view: BoardView, currentWidth: number): Board {
  const label = board.labels.find((entry) => entry.id === id)
  if (!label) return board
  const boardPoint = screenToBoard(view, point)
  const inlineStart = labelXForWidth(label, currentWidth, 0)
  const requested = inlineStart === label.x ? boardPoint.x - inlineStart : inlineStart - boardPoint.x
  const width = Math.max(LABEL_MIN_WIDTH, requested)
  const { size: _size, ...withoutSize } = label
  const resized = { ...withoutSize, x: labelXForWidth(label, currentWidth, width), width }
  return { ...board, labels: board.labels.map((entry) => (entry.id === id ? resized : entry)) }
}

export function marqueeBoardNodes(board: Board, start: Point, point: Point, view: BoardView, shapes: BoardShapes): string[] {
  const left = Math.min(start.x, point.x)
  const top = Math.min(start.y, point.y)
  const right = Math.max(start.x, point.x)
  const bottom = Math.max(start.y, point.y)
  const touches = (x: number, y: number, width: number, height: number) => x <= right && x + width >= left && y <= bottom && y + height >= top
  const items = board.items.flatMap((item) => {
    const origin = boardToScreen(view, item)
    const shape = shapes.items[item.id]
    if (!shape) return []
    const height = (item.width * shape.height) / shape.width
    return touches(origin.x, origin.y, item.width * view.zoom, height * view.zoom) ? [item.id] : []
  })
  const labels = board.labels.flatMap((label) => {
    const origin = boardToScreen(view, label)
    const shape = shapes.labels[label.id]
    return shape && touches(origin.x, origin.y, shape.width * view.zoom, shape.height * view.zoom) ? [label.id] : []
  })
  return [...items, ...labels]
}
