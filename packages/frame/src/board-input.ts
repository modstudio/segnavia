import type { BoardItem } from '@segnavia/format'
import type { BoardInputDelegate } from './board-editing-seam.ts'
import type { BoardGestures } from './board-gestures.ts'

interface BoardInputCallbacks {
  item: (id: string | undefined) => BoardItem | undefined
  itemAt: (event: MouseEvent | PointerEvent) => BoardItem | undefined
  select: (id: string | null, toggle: boolean) => void
  selectAll: () => void
  open: (item: BoardItem) => void
  boardKey: (event: KeyboardEvent) => void
  action: (action: string, item: BoardItem) => void
  focus: (id?: string) => void
}

export class BoardInput {
  private readonly pointerTitles = new Map<number, string>()
  private readonly actionPointers = new Set<number>()
  private readonly delegatedPointers = new Set<number>()
  delegate: BoardInputDelegate | null = null

  constructor(
    private readonly host: HTMLElement,
    private readonly gestures: BoardGestures,
    private readonly callbacks: BoardInputCallbacks,
  ) {}

  connect() {
    this.host.addEventListener('wheel', this.gestures.onWheel, { passive: false })
    this.host.addEventListener('pointerdown', this.onPointerDown)
    this.host.addEventListener('pointermove', this.onPointerMove)
    this.host.addEventListener('pointerup', this.onPointerUp)
    this.host.addEventListener('pointercancel', this.onPointerCancel)
    this.host.addEventListener('keydown', this.onKeyDown)
    this.host.addEventListener('dblclick', this.onDoubleClick)
    this.host.addEventListener('click', this.onClick)
  }

  disconnect() {
    this.host.removeEventListener('wheel', this.gestures.onWheel)
    this.host.removeEventListener('pointerdown', this.onPointerDown)
    this.host.removeEventListener('pointermove', this.onPointerMove)
    this.host.removeEventListener('pointerup', this.onPointerUp)
    this.host.removeEventListener('pointercancel', this.onPointerCancel)
    this.host.removeEventListener('keydown', this.onKeyDown)
    this.host.removeEventListener('dblclick', this.onDoubleClick)
    this.host.removeEventListener('click', this.onClick)
    this.pointerTitles.clear()
    this.actionPointers.clear()
    this.delegatedPointers.clear()
  }

  private onPointerUp = (event: PointerEvent) => {
    if (this.delegatedPointers.delete(event.pointerId)) {
      this.delegate?.pointerUp(event)
      return
    }
    this.gestures.onPointerEnd(event)
    const titleId = this.pointerTitles.get(event.pointerId)
    this.pointerTitles.delete(event.pointerId)
    const actionStarted = this.actionPointers.delete(event.pointerId)
    if (actionStarted || this.gestures.dragged || this.actionButton(event)) return
    const titleItem = this.callbacks.item(titleId)
    this.callbacks.select(titleItem?.id ?? this.callbacks.itemAt(event)?.id ?? null, event.shiftKey)
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.actionButton(event)) {
      this.actionPointers.add(event.pointerId)
      return
    }
    if (event.button === 0) this.callbacks.focus(this.itemNode(event)?.dataset.boardItem ?? this.titleNode(event)?.dataset.boardTitle)
    if (this.delegate?.pointerDown(event)) {
      this.delegatedPointers.add(event.pointerId)
      return
    }
    this.gestures.onPointerDown(event)
    const id = this.titleNode(event)?.dataset.boardTitle
    if (id) this.pointerTitles.set(event.pointerId, id)
  }

  private onPointerCancel = (event: PointerEvent) => {
    if (this.delegatedPointers.delete(event.pointerId)) this.delegate?.pointerCancel(event)
    else this.gestures.onPointerEnd(event)
    this.pointerTitles.delete(event.pointerId)
    this.actionPointers.delete(event.pointerId)
  }

  private onPointerMove = (event: PointerEvent) => {
    if (this.delegatedPointers.has(event.pointerId)) this.delegate?.pointerMove(event)
    else this.gestures.onPointerMove(event)
  }

  private onDoubleClick = (event: MouseEvent) => {
    if (this.gestures.dragged || this.actionButton(event)) return
    const item = this.callbacks.itemAt(event)
    if (item) this.callbacks.open(item)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.delegate?.keyDown(event)) return
    const item = this.callbacks.item(this.itemNode(event)?.dataset.boardItem)
    if (event.key === 'Enter' && item) this.callbacks.open(item)
    else if (event.key === ' ' && item) this.callbacks.select(item.id, false)
    else if (event.key === 'Escape' && (event.target === this.host || item)) this.callbacks.select(null, false)
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && (event.target === this.host || item)) this.callbacks.selectAll()
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

  private titleNode(event: Event): HTMLElement | undefined {
    return event.composedPath().find((target): target is HTMLElement => target instanceof HTMLElement && Boolean(target.dataset.boardTitle))
  }

  private actionButton(event: Event): HTMLButtonElement | undefined {
    return event.composedPath().find((target): target is HTMLButtonElement => target instanceof HTMLButtonElement && Boolean(target.dataset.boardItemAction))
  }
}
