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

export interface BoardOpenDetail {
  item: BoardItem
}

export interface BoardViewDetail {
  view: BoardView
}
