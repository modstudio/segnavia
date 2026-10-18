import type { Canvas, CanvasItem } from './canvas.ts'
import type { Box, Point, Size } from './deck.ts'

export interface CanvasShapes {
  items: Record<string, Size>
  labels: Record<string, Size>
}

export interface CanvasView {
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

export const MIN_CANVAS_ZOOM = 0.05
export const MAX_CANVAS_ZOOM = 8

function requireShape(shapes: CanvasShapes, kind: 'items' | 'labels', id: string): Size {
  if (!Object.hasOwn(shapes[kind], id)) {
    throw new Error(`${kind === 'items' ? 'item' : 'label'} "${id}" has no supplied shape; supply shapes.${kind}["${id}"]`)
  }
  const shape = shapes[kind][id]
  if (!shape) throw new Error(`${kind === 'items' ? 'item' : 'label'} "${id}" has no supplied shape; supply shapes.${kind}["${id}"]`)
  return shape
}

function requireView(view: CanvasView): void {
  if (!(view.zoom > 0)) throw new Error(`canvas view zoom is ${view.zoom}; provide a zoom greater than zero`)
}

export function itemHeight(item: CanvasItem, shape: Size): number {
  return (item.width * shape.height) / shape.width
}

function itemRectangle(item: CanvasItem, shapes: CanvasShapes): Box {
  return { x: item.x, y: item.y, width: item.width, height: itemHeight(item, requireShape(shapes, 'items', item.id)) }
}

function union(rectangles: Box[]): Box {
  if (rectangles.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const left = Math.min(...rectangles.map((rectangle) => rectangle.x))
  const top = Math.min(...rectangles.map((rectangle) => rectangle.y))
  const right = Math.max(...rectangles.map((rectangle) => rectangle.x + rectangle.width))
  const bottom = Math.max(...rectangles.map((rectangle) => rectangle.y + rectangle.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function canvasBounds(canvas: Canvas, shapes: CanvasShapes): Box {
  return union([
    ...canvas.items.map((item) => itemRectangle(item, shapes)),
    ...canvas.labels.map((label) => ({ ...label, ...requireShape(shapes, 'labels', label.id) })),
    ...canvas.sections.map((section) => section.rectangle),
  ])
}

export function canvasToScreen(view: CanvasView, point: Point): Point {
  requireView(view)
  return { x: point.x * view.zoom + view.pan.x, y: point.y * view.zoom + view.pan.y }
}

export function screenToCanvas(view: CanvasView, point: Point): Point {
  requireView(view)
  return { x: (point.x - view.pan.x) / view.zoom, y: (point.y - view.pan.y) / view.zoom }
}

export function zoomToFit(bounds: Box, viewport: Size, padding: number): CanvasView {
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

export function zoomAt(view: CanvasView, point: Point, factor: number, options: ZoomBounds = {}): CanvasView {
  requireView(view)
  if (!(factor > 0)) throw new Error(`zoom factor is ${factor}; provide a factor greater than zero`)
  const minZoom = options.minZoom ?? MIN_CANVAS_ZOOM
  const maxZoom = options.maxZoom ?? MAX_CANVAS_ZOOM
  if (!(minZoom > 0 && maxZoom >= minZoom)) throw new Error('zoom bounds are invalid; provide a positive minZoom no greater than maxZoom')
  const zoom = Math.min(maxZoom, Math.max(minZoom, view.zoom * factor))
  const canvasPoint = screenToCanvas(view, point)
  return {
    ...view,
    zoom,
    pan: { x: point.x - canvasPoint.x * zoom, y: point.y - canvasPoint.y * zoom },
  }
}

function intersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

export function visibleItems(canvas: Canvas, shapes: CanvasShapes, view: CanvasView, margin: number): CanvasItem[] {
  requireView(view)
  const viewport = { x: -margin, y: -margin, width: view.viewport.width + margin * 2, height: view.viewport.height + margin * 2 }
  return canvas.items.filter((item) => {
    const rectangle = itemRectangle(item, shapes)
    const screen = canvasToScreen(view, { x: rectangle.x, y: rectangle.y })
    return intersects({ x: screen.x, y: screen.y, width: rectangle.width * view.zoom, height: rectangle.height * view.zoom }, viewport)
  })
}

export function itemAt(canvas: Canvas, shapes: CanvasShapes, point: Point): CanvasItem | undefined {
  for (let index = canvas.items.length - 1; index >= 0; index -= 1) {
    const item = canvas.items[index]
    if (!item) continue
    const rectangle = itemRectangle(item, shapes)
    if (point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width && point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height) {
      return item
    }
  }
  return undefined
}

function arrangedItems(canvas: Canvas, shapes: CanvasShapes, options: ArrangeOptions): CanvasItem[] {
  if (
    options.layout === 'grid' &&
    options.columns !== undefined &&
    (!Number.isFinite(options.columns) || !Number.isInteger(options.columns) || options.columns <= 0)
  ) {
    throw new Error(`grid columns is ${options.columns}; provide a positive integer`)
  }
  const columns = options.layout === 'row' ? Math.max(1, canvas.items.length) : Math.max(1, options.columns ?? Math.ceil(Math.sqrt(canvas.items.length)))
  const columnWidths = Array.from({ length: columns }, () => 0)
  const rowHeights = Array.from({ length: Math.ceil(canvas.items.length / columns) }, () => 0)
  canvas.items.forEach((item, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, item.width)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, itemHeight(item, requireShape(shapes, 'items', item.id)))
  })
  const offsets = (sizes: number[]) => sizes.map((_, index) => sizes.slice(0, index).reduce((total, size) => total + size, 0) + index * options.gap)
  const xOffsets = offsets(columnWidths)
  const yOffsets = offsets(rowHeights)
  return canvas.items.map((item, index) => {
    const column = index % columns
    const x = xOffsets[column] ?? 0
    return {
      ...item,
      x: canvas.direction === 'rtl' ? -x - item.width : x,
      y: yOffsets[Math.floor(index / columns)] ?? 0,
    }
  })
}

export function arrange(canvas: Canvas, shapes: CanvasShapes, options: ArrangeOptions): Canvas {
  const items = arrangedItems(canvas, shapes, options)
  const byId = new Map(items.map((item) => [item.id, item]))
  const padding = options.sectionPadding ?? options.gap
  const sections = canvas.sections.map((section) => {
    if (section.items.length === 0) return section
    const rectangle = union(section.items.map((id) => itemRectangle(byId.get(id) as CanvasItem, shapes)))
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
  return { ...canvas, items, sections }
}
