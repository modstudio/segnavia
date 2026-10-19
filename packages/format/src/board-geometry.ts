import type { Board, BoardItem } from './board.ts'
import type { Box, Point, Size } from './deck.ts'

export interface BoardShapes {
  items: Record<string, Size>
  labels: Record<string, Size>
}

export interface BoardView {
  zoom: number
  pan: Point
  viewport: Size
}

export interface ZoomBounds {
  minZoom?: number
  maxZoom?: number
}

export interface ArrangeOptions {
  layout: 'grid' | 'row'
  gap: number
  columns?: number
  sectionPadding?: number
}

export const MIN_BOARD_ZOOM = 0.05
export const MAX_BOARD_ZOOM = 8

function requireShape(shapes: BoardShapes, kind: 'items' | 'labels', id: string): Size {
  if (!Object.hasOwn(shapes[kind], id)) {
    throw new Error(`${kind === 'items' ? 'item' : 'label'} "${id}" has no supplied shape; supply shapes.${kind}["${id}"]`)
  }
  const shape = shapes[kind][id]
  if (!shape) throw new Error(`${kind === 'items' ? 'item' : 'label'} "${id}" has no supplied shape; supply shapes.${kind}["${id}"]`)
  return shape
}

function requireView(view: BoardView): void {
  if (!(view.zoom > 0)) throw new Error(`board view zoom is ${view.zoom}; provide a zoom greater than zero`)
}

export function itemHeight(item: BoardItem, shape: Size): number {
  return (item.width * shape.height) / shape.width
}

function itemRectangle(item: BoardItem, shapes: BoardShapes): Box {
  const shape = requireShape(shapes, 'items', item.id)
  return { x: item.x, y: item.y, width: item.width, height: itemHeight(item, shape) }
}

function union(rectangles: Box[]): Box {
  if (rectangles.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const left = Math.min(...rectangles.map((rectangle) => rectangle.x))
  const top = Math.min(...rectangles.map((rectangle) => rectangle.y))
  const right = Math.max(...rectangles.map((rectangle) => rectangle.x + rectangle.width))
  const bottom = Math.max(...rectangles.map((rectangle) => rectangle.y + rectangle.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function boardBounds(board: Board, shapes: BoardShapes): Box {
  return union([
    ...board.items.map((item) => itemRectangle(item, shapes)),
    ...board.labels.map((label) => {
      const shape = requireShape(shapes, 'labels', label.id)
      return { x: label.x, y: label.y, width: shape.width, height: shape.height }
    }),
    ...board.sections.map((section) => section.rectangle),
  ])
}

export function boardToScreen(view: BoardView, point: Point): Point {
  requireView(view)
  return { x: point.x * view.zoom + view.pan.x, y: point.y * view.zoom + view.pan.y }
}

export function screenToBoard(view: BoardView, point: Point): Point {
  requireView(view)
  return { x: (point.x - view.pan.x) / view.zoom, y: (point.y - view.pan.y) / view.zoom }
}

export function zoomToFit(bounds: Box, viewport: Size, padding: number): BoardView {
  const availableWidth = viewport.width - padding * 2
  const availableHeight = viewport.height - padding * 2
  if (!(availableWidth > 0 && availableHeight > 0 && bounds.width > 0 && bounds.height > 0)) {
    throw new Error('zoom to fit needs positive bounds and a viewport larger than twice its padding; provide non-empty bounds and usable space')
  }
  const zoom = Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
  return {
    zoom,
    pan: {
      x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom,
      y: (viewport.height - bounds.height * zoom) / 2 - bounds.y * zoom,
    },
    viewport,
  }
}

export function revealView(bounds: Box, viewport: Size, padding: number, options: ZoomBounds = {}): BoardView {
  const fitted = zoomToFit(bounds, viewport, padding)
  const minZoom = options.minZoom ?? MIN_BOARD_ZOOM
  const maxZoom = options.maxZoom ?? MAX_BOARD_ZOOM
  if (!(minZoom > 0 && maxZoom >= minZoom)) throw new Error('zoom bounds are invalid; provide a positive minZoom no greater than maxZoom')
  const zoom = Math.min(maxZoom, Math.max(minZoom, fitted.zoom))
  return {
    zoom,
    pan: {
      x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    },
    viewport,
  }
}

export function zoomAt(view: BoardView, point: Point, factor: number, options: ZoomBounds = {}): BoardView {
  requireView(view)
  if (!(factor > 0)) throw new Error(`zoom factor is ${factor}; provide a factor greater than zero`)
  const minZoom = options.minZoom ?? MIN_BOARD_ZOOM
  const maxZoom = options.maxZoom ?? MAX_BOARD_ZOOM
  if (!(minZoom > 0 && maxZoom >= minZoom)) throw new Error('zoom bounds are invalid; provide a positive minZoom no greater than maxZoom')
  const zoom = Math.min(maxZoom, Math.max(minZoom, view.zoom * factor))
  const boardPoint = screenToBoard(view, point)
  return {
    ...view,
    zoom,
    pan: { x: point.x - boardPoint.x * zoom, y: point.y - boardPoint.y * zoom },
  }
}

function intersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

export function visibleItems(board: Board, shapes: BoardShapes, view: BoardView, margin: number): BoardItem[] {
  requireView(view)
  const viewport = { x: -margin, y: -margin, width: view.viewport.width + margin * 2, height: view.viewport.height + margin * 2 }
  return board.items.filter((item) => {
    const rectangle = itemRectangle(item, shapes)
    const screen = boardToScreen(view, { x: rectangle.x, y: rectangle.y })
    return intersects({ x: screen.x, y: screen.y, width: rectangle.width * view.zoom, height: rectangle.height * view.zoom }, viewport)
  })
}

export function itemAt(board: Board, shapes: BoardShapes, point: Point): BoardItem | undefined {
  for (let index = board.items.length - 1; index >= 0; index -= 1) {
    const item = board.items[index]
    if (!item) continue
    const rectangle = itemRectangle(item, shapes)
    if (point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width && point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height) {
      return item
    }
  }
  return undefined
}

function arrangedItems(board: Board, shapes: BoardShapes, options: ArrangeOptions): BoardItem[] {
  if (
    options.layout === 'grid' &&
    options.columns !== undefined &&
    (!Number.isFinite(options.columns) || !Number.isInteger(options.columns) || options.columns <= 0)
  ) {
    throw new Error(`grid columns is ${options.columns}; provide a positive integer`)
  }
  const columns = options.layout === 'row' ? Math.max(1, board.items.length) : Math.max(1, options.columns ?? Math.ceil(Math.sqrt(board.items.length)))
  const columnWidths = Array.from({ length: columns }, () => 0)
  const rowHeights = Array.from({ length: Math.ceil(board.items.length / columns) }, () => 0)
  board.items.forEach((item, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, item.width)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, itemHeight(item, requireShape(shapes, 'items', item.id)))
  })
  const offsets = (sizes: number[]) => sizes.map((_, index) => sizes.slice(0, index).reduce((total, size) => total + size, 0) + index * options.gap)
  const xOffsets = offsets(columnWidths)
  const yOffsets = offsets(rowHeights)
  return board.items.map((item, index) => {
    const column = index % columns
    const x = xOffsets[column] ?? 0
    return {
      ...item,
      x: board.direction === 'rtl' ? -x - item.width : x,
      y: yOffsets[Math.floor(index / columns)] ?? 0,
    }
  })
}

export function arrange(board: Board, shapes: BoardShapes, options: ArrangeOptions): Board {
  const items = arrangedItems(board, shapes, options)
  const byId = new Map(items.map((item) => [item.id, item]))
  const padding = options.sectionPadding ?? options.gap
  const sections = board.sections.map((section) => {
    if (section.items.length === 0) return section
    const rectangle = union(section.items.map((id) => itemRectangle(byId.get(id) as BoardItem, shapes)))
    return {
      ...section,
      rectangle: {
        x: rectangle.x - padding,
        y: rectangle.y - padding,
        width: rectangle.width + padding * 2,
        height: rectangle.height + padding * 2,
      },
    }
  })
  return { ...board, items, sections }
}
