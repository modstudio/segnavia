import { type BoardView, type Point, zoomAt } from '@segnavia/format'
import { type Pinch, pinchOf } from './board-policy.ts'

// Pointer and wheel input that pans and zooms a board. A drag beyond 4 px counts as a pan, so the double click that ends it does not open an item.
export class BoardGestures {
  private readonly pointers = new Map<number, Point>()
  private pointerStart: Point | null = null
  private lastPinch: Pinch | null = null
  dragged = false

  constructor(
    private readonly host: HTMLElement,
    private readonly view: () => BoardView,
    private readonly setView: (view: BoardView) => void,
  ) {}

  local(event: { clientX: number; clientY: number }): Point {
    const box = this.host.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  readonly onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const view = this.view()
    if (event.ctrlKey || event.metaKey) this.setView(zoomAt(view, this.local(event), Math.exp(-event.deltaY * 0.01)))
    else this.setView({ ...view, pan: { x: view.pan.x - event.deltaX, y: view.pan.y - event.deltaY } })
  }

  readonly onPointerDown = (event: PointerEvent) => {
    this.host.setPointerCapture(event.pointerId)
    const point = this.local(event)
    this.pointers.set(event.pointerId, point)
    if (this.pointers.size === 1) this.pointerStart = point
    this.lastPinch = pinchOf([...this.pointers.values()])
    this.dragged = false
  }

  readonly onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId)
    if (!previous) return
    const point = this.local(event)
    this.pointers.set(event.pointerId, point)
    const pinch = pinchOf([...this.pointers.values()])
    const view = this.view()
    if (pinch && this.lastPinch) {
      const zoomed = zoomAt(view, pinch.midpoint, pinch.distance / this.lastPinch.distance)
      this.setView({
        ...zoomed,
        pan: { x: zoomed.pan.x + pinch.midpoint.x - this.lastPinch.midpoint.x, y: zoomed.pan.y + pinch.midpoint.y - this.lastPinch.midpoint.y },
      })
      this.lastPinch = pinch
    } else if (this.pointers.size === 1) {
      this.setView({ ...view, pan: { x: view.pan.x + point.x - previous.x, y: view.pan.y + point.y - previous.y } })
    }
    if (this.pointerStart && Math.hypot(point.x - this.pointerStart.x, point.y - this.pointerStart.y) > 4) this.dragged = true
  }

  readonly onPointerEnd = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId)
    this.lastPinch = pinchOf([...this.pointers.values()])
    if (this.pointers.size === 0) this.pointerStart = null
  }
}
