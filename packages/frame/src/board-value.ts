import type { Board } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'

export const internalBoardValue = Symbol.for('@segnavia/frame/internal-board-value')

export function boardValue(board: SegnaviaBoard): Board | null {
  return board[internalBoardValue]()
}
