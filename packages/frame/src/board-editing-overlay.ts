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
  SECTION_PADDING,
  SECTION_TITLE_ROOM,
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

interface MarkerItemBox {
  x: number
  y: number
  width: number
  height: number
}

function markerItemBox(board: Board, shapes: BoardShapes, id: string | undefined): MarkerItemBox | undefined {
  const item = board.items.find((entry) => entry.id === id)
  const shape = id ? shapes.items[id] : undefined
  return item && shape ? { ...item, height: itemHeight(item, shape) } : undefined
}

function rowMarkerBox(board: Board, shapes: BoardShapes, section: Board['sections'][number], row: number, column: number): MarkerItemBox {
  const cells = section.cells?.filter((cell) => cell.row === row) ?? []
  const next = markerItemBox(board, shapes, cells.find((cell) => cell.column === column)?.id)
  const previous = markerItemBox(board, shapes, cells.find((cell) => cell.column === column - 1)?.id)
  let x = section.rectangle.x + SECTION_PADDING
  if (next) x = board.direction === 'rtl' ? next.x + next.width : next.x
  else if (previous) x = board.direction === 'rtl' ? previous.x : previous.x + previous.width
  const boxes = cells.map((cell) => markerItemBox(board, shapes, cell.id)).filter((box): box is MarkerItemBox => Boolean(box))
  const y = boxes.length ? Math.min(...boxes.map((box) => box.y)) : section.rectangle.y + SECTION_PADDING + SECTION_TITLE_ROOM
  const height = boxes.length ? Math.max(...boxes.map((box) => box.height)) : section.rectangle.height - SECTION_PADDING * 2 - SECTION_TITLE_ROOM
  return { x, y, width: 2, height }
}

function columnMarkerBox(board: Board, shapes: BoardShapes, section: Board['sections'][number], row: number, column: number): MarkerItemBox {
  const cells = section.cells?.filter((cell) => cell.column === column) ?? []
  const next = markerItemBox(board, shapes, cells.find((cell) => cell.row === row)?.id)
  const previous = markerItemBox(board, shapes, cells.find((cell) => cell.row === row - 1)?.id)
  const y = next?.y ?? (previous ? previous.y + previous.height : section.rectangle.y + SECTION_PADDING + SECTION_TITLE_ROOM)
  const boxes = cells.map((cell) => markerItemBox(board, shapes, cell.id)).filter((box): box is MarkerItemBox => Boolean(box))
  const x = boxes.length ? Math.min(...boxes.map((box) => box.x)) : section.rectangle.x + SECTION_PADDING
  const width = boxes.length ? Math.max(...boxes.map((box) => box.width)) : section.rectangle.width - SECTION_PADDING * 2
  return { x, y, width, height: 2 }
}

export function renderDropMarker(
  overlay: HTMLElement,
  board: Board | undefined,
  sectionId: string | undefined,
  target: { row: number; column: number; axis: 'row' | 'column' } | undefined,
  view: BoardView,
  shapes: BoardShapes,
) {
  overlay.querySelector('[part~="drop-marker"]')?.remove()
  const section = board?.sections.find((entry) => entry.id === sectionId)
  if (!board || !section || !target) return
  const box =
    target.axis === 'row' ? rowMarkerBox(board, shapes, section, target.row, target.column) : columnMarkerBox(board, shapes, section, target.row, target.column)
  const point = boardToScreen(view, box)
  const marker = document.createElement('div')
  marker.part.add('drop-marker')
  Object.assign(marker.style, { left: `${point.x}px`, top: `${point.y}px`, width: `${box.width * view.zoom}px`, height: `${box.height * view.zoom}px` })
  overlay.append(marker)
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
