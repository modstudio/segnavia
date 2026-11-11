import type { BoardItem } from '@segnavia/format'
import type { BoardPointerDelegate } from './board-editing-seam.ts'
import { boardPathElement } from './board-event-path.ts'
import type { BoardFocusStop } from './board-focus.ts'
import type { BoardGestures } from './board-gestures.ts'

interface BoardPointerCallbacks {
  item: (id: string | undefined) => BoardItem | undefined
  itemAt: (event: MouseEvent | PointerEvent) => BoardItem | undefined
  select: (id: string | null, toggle: boolean) => void
  selectAll: () => void
  open: (item: BoardItem) => void
  boardKey: (event: KeyboardEvent) => void
  action: (action: string, item: BoardItem) => void
  focus: (id?: string) => void
  focusByTab: (current: BoardFocusStop | undefined, backwards: boolean) => boolean
}

export class BoardPointerInput {
  private readonly pointerTitles = new Map<number, string>()
  private readonly actionPointers = new Set<number>()
  private readonly delegatedPointers = new Set<number>()
  delegate: BoardPointerDelegate | null = null

  constructor(
    private readonly host: HTMLElement,
    private readonly gestures: BoardGestures,
    private readonly callbacks: BoardPointerCallbacks,
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
    this.callbacks.select(titleId ?? this.entityId(event) ?? this.callbacks.itemAt(event)?.id ?? null, event.shiftKey)
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.actionButton(event)) {
      this.actionPointers.add(event.pointerId)
      return
    }
    if (event.button === 0) this.callbacks.focus(this.entityId(event))
    if (this.delegate?.pointerDown(event)) {
      this.delegatedPointers.add(event.pointerId)
      return
    }
    this.gestures.onPointerDown(event)
    const id = boardPathElement(event, 'boardTitle')?.dataset.boardTitle
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
    if (this.gestures.dragged || this.actionButton(event) || boardPathElement(event, 'labelResizeHandle')) return
    if (boardPathElement(event, 'boardLabel')) return
    const item = this.callbacks.itemAt(event)
    if (item) this.callbacks.open(item)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      if (this.callbacks.focusByTab(this.focusStop(event), event.shiftKey)) event.preventDefault()
      return
    }
    const id = this.actionButton(event) ? undefined : this.entityId(event)
    if (event.key === ' ' && id) {
      this.callbacks.select(id, event.shiftKey)
      event.preventDefault()
      return
    }
    if (event.key === 'Escape' && (event.target === this.host || id)) {
      this.callbacks.select(null, false)
      event.preventDefault()
      return
    }
    if (this.delegate?.keyDown(event)) return
    const item = this.callbacks.item(id)
    if (event.key === 'Enter' && item) this.callbacks.open(item)
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && (event.target === this.host || id)) this.callbacks.selectAll()
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

  private entityId(event: Event): string | undefined {
    return (
      boardPathElement(event, 'boardItem')?.dataset.boardItem ??
      boardPathElement(event, 'boardTitle')?.dataset.boardTitle ??
      boardPathElement(event, 'boardSectionTitle')?.dataset.boardSectionTitle ??
      boardPathElement(event, 'boardLabel')?.dataset.boardLabel
    )
  }

  private actionButton(event: Event): HTMLButtonElement | undefined {
    return event.composedPath().find((target): target is HTMLButtonElement => target instanceof HTMLButtonElement && Boolean(target.dataset.boardItemAction))
  }

  private focusStop(event: Event): BoardFocusStop | undefined {
    const action = this.actionButton(event)
    const actionIndex = Number(action?.dataset.boardItemActionIndex)
    if (action?.dataset.boardItemAction && Number.isInteger(actionIndex)) return { id: action.dataset.boardItemAction, action: actionIndex }
    const id = this.entityId(event)
    return id ? { id } : undefined
  }
}
