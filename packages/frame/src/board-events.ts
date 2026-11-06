import type { BoardItem, BoardView, Document } from '@segnavia/format'

export interface BoardChangeDetail {
  board: Document | null
}

export interface BoardErrorDetail {
  item?: BoardItem
  items?: readonly BoardItem[]
  error: unknown
}

export interface BoardItemActionDetail {
  action: string
  item: BoardItem
}

export interface BoardListToggleDetail {
  open: boolean
}

export interface BoardOpenDetail {
  item: BoardItem
}

export interface BoardShareDetail {
  board: Document | null
}

export interface BoardViewDetail {
  view: BoardView
}

interface BoardEventDetails {
  'segnavia-board-change': BoardChangeDetail
  'segnavia-board-error': BoardErrorDetail
  'segnavia-board-item-action': BoardItemActionDetail
  'segnavia-board-list-toggle': BoardListToggleDetail
  'segnavia-board-open': BoardOpenDetail
  'segnavia-board-share': BoardShareDetail
  'segnavia-board-view': BoardViewDetail
}

type BoardSignalEventName = 'segnavia-board-icons' | 'segnavia-board-names'

// A listener may veto only the list toggle; every other board event reports what already happened.
const CANCELABLE: Record<keyof BoardEventDetails | BoardSignalEventName, boolean> = {
  'segnavia-board-change': false,
  'segnavia-board-error': false,
  'segnavia-board-icons': false,
  'segnavia-board-item-action': false,
  'segnavia-board-list-toggle': true,
  'segnavia-board-names': false,
  'segnavia-board-open': false,
  'segnavia-board-share': false,
  'segnavia-board-view': false,
}

export function boardEvent<Name extends keyof BoardEventDetails>(name: Name, detail: BoardEventDetails[Name]): CustomEvent<BoardEventDetails[Name]>
export function boardEvent(name: BoardSignalEventName): CustomEvent
export function boardEvent(name: keyof BoardEventDetails | BoardSignalEventName, detail?: BoardEventDetails[keyof BoardEventDetails]): CustomEvent {
  return new CustomEvent(name, { bubbles: true, composed: true, cancelable: CANCELABLE[name], detail })
}

export class BoardViewEventDispatcher {
  private pending = 0

  constructor(private readonly target: EventTarget) {}

  schedule(detail: () => BoardViewDetail): void {
    if (this.pending) return
    this.pending = requestAnimationFrame(() => {
      this.pending = 0
      this.target.dispatchEvent(boardEvent('segnavia-board-view', detail()))
    })
  }
}
