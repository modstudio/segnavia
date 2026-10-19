import type { BoardItem } from '@segnavia/format'
import type { BoardGestures } from './board-gestures.ts'

interface BoardInputCallbacks {
  item: (id: string | undefined) => BoardItem | undefined
  itemAt: (event: MouseEvent | PointerEvent) => BoardItem | undefined
  select: (id: string | null) => void
  open: (item: BoardItem) => void
  boardKey: (event: KeyboardEvent) => void
  action: (action: string, item: BoardItem) => void
}

export class BoardInput {
  constructor(
    private readonly host: HTMLElement,
    private readonly gestures: BoardGestures,
    private readonly callbacks: BoardInputCallbacks,
  ) {}

  connect() {
    this.host.addEventListener('wheel', this.gestures.onWheel, { passive: false })
    this.host.addEventListener('pointerdown', this.gestures.onPointerDown)
    this.host.addEventListener('pointermove', this.gestures.onPointerMove)
    this.host.addEventListener('pointerup', this.gestures.onPointerEnd)
    this.host.addEventListener('pointerup', this.onPointerUp)
    this.host.addEventListener('pointercancel', this.gestures.onPointerEnd)
    this.host.addEventListener('keydown', this.onKeyDown)
    this.host.addEventListener('dblclick', this.onDoubleClick)
    this.host.addEventListener('click', this.onClick)
  }

  disconnect() {
    this.host.removeEventListener('wheel', this.gestures.onWheel)
    this.host.removeEventListener('pointerdown', this.gestures.onPointerDown)
    this.host.removeEventListener('pointermove', this.gestures.onPointerMove)
    this.host.removeEventListener('pointerup', this.gestures.onPointerEnd)
    this.host.removeEventListener('pointerup', this.onPointerUp)
    this.host.removeEventListener('pointercancel', this.gestures.onPointerEnd)
    this.host.removeEventListener('keydown', this.onKeyDown)
    this.host.removeEventListener('dblclick', this.onDoubleClick)
    this.host.removeEventListener('click', this.onClick)
  }

  private onPointerUp = (event: PointerEvent) => {
    if (this.gestures.dragged || this.actionButton(event)) return
    this.callbacks.select(this.callbacks.itemAt(event)?.id ?? null)
  }

  private onDoubleClick = (event: MouseEvent) => {
    if (this.gestures.dragged || this.actionButton(event)) return
    const item = this.callbacks.itemAt(event)
    if (item) this.callbacks.open(item)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const item = this.callbacks.item(this.itemNode(event)?.dataset.boardItem)
    if (event.key === 'Enter' && item) this.callbacks.open(item)
    else if (event.key === ' ' && item) this.callbacks.select(item.id)
    else if (event.key === 'Escape' && (event.target === this.host || item)) this.callbacks.select(null)
    else {
      if (event.target === this.host) this.callbacks.boardKey(event)
      return
    }
    event.preventDefault()
  }

  private onClick = (event: MouseEvent) => {
    const button = this.actionButton(event)
    const item = this.callbacks.item(button?.dataset.boardItemAction)
    if (button?.dataset.action && item) this.callbacks.action(button.dataset.action, item)
  }

  private itemNode(event: Event): HTMLElement | undefined {
    return event.composedPath().find((target): target is HTMLElement => target instanceof HTMLElement && Boolean(target.dataset.boardItem))
  }

  private actionButton(event: Event): HTMLButtonElement | undefined {
    return event.composedPath().find((target): target is HTMLButtonElement => target instanceof HTMLButtonElement && Boolean(target.dataset.boardItemAction))
  }
}
