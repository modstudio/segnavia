import type { BoardItem } from '@segnavia/format'
import type { ResolvedBoardItem } from './board-policy.ts'

export type ResolveBoardItem = (item: BoardItem) => Promise<ResolvedBoardItem>

export interface BoardCacheEntry {
  promise?: Promise<void>
  value?: ResolvedBoardItem
  error?: unknown
  failed?: boolean
}
