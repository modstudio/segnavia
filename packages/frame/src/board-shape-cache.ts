import type { Board, ComputedBoardShapes } from '@segnavia/format'
import type { BoardDecorations } from './board-decorations.ts'
import { boardShapeFacts, type CheckedResolvedBoardItem } from './board-policy.ts'

export class BoardShapeCache {
  value: ComputedBoardShapes = { shapes: { items: {}, labels: {} }, provisional: [], estimated: [] }

  constructor(private readonly decorations: BoardDecorations) {}

  clear() {
    this.value = { shapes: { items: {}, labels: {} }, provisional: [], estimated: [] }
  }

  update(board: Board, resolved: (address: string) => CheckedResolvedBoardItem | undefined, zoom: number) {
    this.value = this.decorations.shapes(board, boardShapeFacts(board.items, resolved), zoom)
  }
}
