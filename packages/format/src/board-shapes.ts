import type { Board, BoardItem } from './board.ts'
import type { Size } from './deck.ts'
import { resolveDirection } from './direction.ts'
import type { AssetKind } from './placement.ts'

export type BoardItemFact =
  | { kind: 'deck'; deck: { size: Size } }
  | { kind: 'page'; size: Size }
  | { kind: 'paper'; size: Size }
  | { kind: 'book'; size: Size }
  | { kind: 'media'; width: number; height: number }
  | { kind: 'shot'; width: number; height: number }

export interface BoardShapesOptions {
  measureLabel?: (text: string, direction: Board['direction']) => Size | undefined
}

export interface ComputedBoardShapes {
  shapes: { items: Record<string, Size>; labels: Record<string, Size> }
  provisional: string[]
  estimated: string[]
}

// This is the browser-independent fallback for a label whose rendered box is not available.
export const BOARD_LABEL_ESTIMATE = { widthPerCharacter: 8, height: 19 } as const

export function resolvedShape(fact: BoardItemFact): Size {
  if (fact.kind === 'deck') return fact.deck.size
  if (fact.kind === 'media' || fact.kind === 'shot') return { width: fact.width, height: fact.height }
  return fact.size
}

export function provisionalShape(kind: AssetKind): Size {
  if (kind === 'deck') return { width: 16, height: 9 }
  if (kind === 'page' || kind === 'paper' || kind === 'book') return { width: 1, height: Math.SQRT2 }
  return { width: 4, height: 3 }
}

function itemShape(item: BoardItem, facts: Readonly<Record<string, BoardItemFact>>, provisional: string[]): Size {
  const fact = facts[item.address]
  if (!fact) {
    provisional.push(item.id)
    return provisionalShape(item.kind)
  }
  if (fact.kind !== item.kind) {
    throw new Error(
      `board item "${item.id}" at "${item.address}" has kind ${item.kind}, but its resolved fact has kind ${fact.kind}; provide a ${item.kind} fact for that address`,
    )
  }
  return resolvedShape(fact)
}

function estimatedLabelShape(text: string): Size {
  return { width: Math.max(1, text.length * BOARD_LABEL_ESTIMATE.widthPerCharacter), height: BOARD_LABEL_ESTIMATE.height }
}

export function boardShapes(board: Board, facts: Readonly<Record<string, BoardItemFact>>, options: BoardShapesOptions = {}): ComputedBoardShapes {
  const provisional: string[] = []
  const estimated: string[] = []
  const items = Object.fromEntries(board.items.map((item) => [item.id, itemShape(item, facts, provisional)]))
  const labels = Object.fromEntries(
    board.labels.map((label) => {
      if (label.size) return [label.id, label.size]
      const measured = options.measureLabel?.(label.text, resolveDirection(undefined, undefined, label.text))
      if (measured) return [label.id, measured]
      estimated.push(label.id)
      return [label.id, estimatedLabelShape(label.text)]
    }),
  )
  return { shapes: { items, labels }, provisional, estimated }
}
