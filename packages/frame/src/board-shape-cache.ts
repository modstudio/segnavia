import type { Board, BoardItemFact, ComputedBoardShapes } from '@segnavia/format'
import type { BoardDecorations } from './board-decorations.ts'
import { type BoardResolutionOutcome, boardShapeFacts } from './board-policy.ts'

const EMPTY_COMPUTED_SHAPES: ComputedBoardShapes = { shapes: { items: {}, labels: {} }, provisional: [], estimated: [] }

export function copyComputedBoardShapes(value: ComputedBoardShapes): ComputedBoardShapes {
  return {
    shapes: { items: { ...value.shapes.items }, labels: { ...value.shapes.labels } },
    provisional: [...value.provisional],
    estimated: [...value.estimated],
  }
}

export class BoardShapeCache {
  value: ComputedBoardShapes = EMPTY_COMPUTED_SHAPES
  facts: Readonly<Record<string, BoardItemFact>> = {}

  constructor(private readonly decorations: BoardDecorations) {}

  clear() {
    this.value = EMPTY_COMPUTED_SHAPES
    this.facts = {}
  }

  update(board: Board, outcome: (address: string) => BoardResolutionOutcome, zoom: number) {
    this.facts = boardShapeFacts(board.items, outcome)
    this.value = this.decorations.shapes(board, this.facts, zoom)
  }
}
