import type { Board, BoardItemFact, ComputedBoardShapes } from '@segnavia/format'
import type { BoardDecorations } from './board-decorations.ts'
import { boardShapeFacts } from './board-policy.ts'
import type { BoardResolutionOutcome } from './board-resolutions.ts'

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
    this.facts = boardShapeFacts(board.items, (address) => {
      const result = outcome(address)
      return result.status === 'resolved' || result.status === 'unavailable' ? result.value : undefined
    })
    this.value = this.decorations.shapes(board, this.facts, zoom)
  }
}
