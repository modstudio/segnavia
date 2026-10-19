import {
  type Board,
  type BoardItem,
  type BoardItemAnchor,
  type BoardShapes,
  type BoardView,
  boardToScreen,
  itemHeight,
  type Point,
  resizeItem,
  screenToBoard,
} from '@segnavia/format'
import { provisionalShape } from './board-policy.ts'

const anchors: Record<string, BoardItemAnchor> = {
  'top-left': 'bottom-right',
  'top-right': 'bottom-left',
  'bottom-left': 'top-right',
  'bottom-right': 'top-left',
}

export function resizedAtPointer(board: Board, id: string, corner: string, point: Point, view: BoardView, shape: { width: number; height: number }): Board {
  const item = board.items.find((entry) => entry.id === id)
  const anchor = anchors[corner]
  if (!item || !anchor) return board
  const boardPoint = screenToBoard(view, point)
  const width = corner.endsWith('right') ? boardPoint.x - item.x : item.x + item.width - boardPoint.x
  return resizeItem(board, id, width, anchor, (value) => (value * shape.height) / shape.width)
}

export function marqueeItems(board: Board, start: Point, point: Point, view: BoardView, shapes: BoardShapes): BoardItem[] {
  const left = Math.min(start.x, point.x)
  const top = Math.min(start.y, point.y)
  const width = Math.abs(point.x - start.x)
  const height = Math.abs(point.y - start.y)
  return board.items.filter((item) => {
    const itemStart = boardToScreen(view, item)
    const itemWidth = item.width * view.zoom
    const itemHeightPx = itemHeight(item, shapes.items[item.id] ?? provisionalShape(item.kind)) * view.zoom
    return itemStart.x <= left + width && itemStart.x + itemWidth >= left && itemStart.y <= top + height && itemStart.y + itemHeightPx >= top
  })
}

export function placeMarquee(node: HTMLElement, start: Point, point: Point) {
  Object.assign(node.style, {
    left: `${Math.min(start.x, point.x)}px`,
    top: `${Math.min(start.y, point.y)}px`,
    width: `${Math.abs(point.x - start.x)}px`,
    height: `${Math.abs(point.y - start.y)}px`,
  })
}

export function renderResizeHandles(overlay: HTMLElement, item: BoardItem | undefined, view: BoardView, shape: { width: number; height: number } | undefined) {
  overlay.replaceChildren(...[...overlay.children].filter((node) => (node as HTMLElement).part.contains('marquee')))
  if (!item || !shape) return
  const point = boardToScreen(view, item)
  const width = item.width * view.zoom
  const height = itemHeight(item, shape) * view.zoom
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const handle = document.createElement('div')
    handle.part.add('resize-handle')
    handle.dataset.resizeHandle = ''
    handle.dataset.corner = corner
    handle.style.left = `${point.x + (corner.endsWith('right') ? width : 0)}px`
    handle.style.top = `${point.y + (corner.startsWith('bottom') ? height : 0)}px`
    overlay.append(handle)
  }
}
