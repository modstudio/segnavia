import type { Board, BoardItem, BoardView } from '@segnavia/format'

export interface BoardChangeDetail {
  board: Board | null
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
  board: Board | null
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

const eventOptions = { bubbles: true, composed: true } as const

export function boardEvent<Name extends keyof BoardEventDetails>(name: Name, detail: BoardEventDetails[Name]): CustomEvent<BoardEventDetails[Name]>
export function boardEvent(name: BoardSignalEventName): CustomEvent
export function boardEvent(name: keyof BoardEventDetails | BoardSignalEventName, detail?: BoardEventDetails[keyof BoardEventDetails]): CustomEvent {
  const options = name === 'segnavia-board-list-toggle' ? { ...eventOptions, cancelable: true } : eventOptions
  return new CustomEvent(name, detail === undefined ? options : { ...options, detail })
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
