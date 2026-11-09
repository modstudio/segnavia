import type { Board, BoardItem, BoardLabel } from './board.ts'
import { type BoardShapes, labelDirection } from './board-geometry.ts'
import type { MeasuredSize, PixelSize } from './deck.ts'
import type { AssetKind } from './placement.ts'

export type BoardItemFact =
  | { kind: 'deck'; deck: { size: PixelSize } }
  | { kind: 'page'; size: PixelSize }
  | { kind: 'paper'; size: PixelSize }
  | { kind: 'book'; size: PixelSize }
  | { kind: 'media'; size: MeasuredSize }
  | { kind: 'shot'; size: MeasuredSize }

export interface BoardShapesOptions {
  measureLabel?: (text: string, direction: Board['direction'], width: number | undefined) => MeasuredSize | undefined
}

export interface ComputedBoardShapes {
  shapes: BoardShapes
  provisional: string[]
  estimated: string[]
}

export interface LabelShapeResult {
  shape: MeasuredSize
  source: 'stored' | 'measured' | 'estimated'
}

// This is the browser-independent fallback for a label whose rendered box is not available.
export const BOARD_LABEL_ESTIMATE = { widthPerCharacter: 8, height: 19 } as const

export function resolvedShape(fact: BoardItemFact): MeasuredSize {
  if (fact.kind === 'deck') return fact.deck.size
  return fact.size
}

export function provisionalShape(kind: AssetKind): MeasuredSize {
  if (kind === 'deck') return { width: 16, height: 9 }
  if (kind === 'page' || kind === 'paper' || kind === 'book') return { width: 1, height: Math.SQRT2 }
  return { width: 4, height: 3 }
}

function itemShape(item: BoardItem, facts: Readonly<Record<string, BoardItemFact>>, provisional: string[]): MeasuredSize {
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

function estimatedLabelShape(label: BoardLabel): MeasuredSize {
  if (label.width === undefined) return { width: Math.max(1, label.text.length * BOARD_LABEL_ESTIMATE.widthPerCharacter), height: BOARD_LABEL_ESTIMATE.height }
  const charactersPerLine = Math.max(1, Math.floor(label.width / BOARD_LABEL_ESTIMATE.widthPerCharacter))
  // This is deliberately a simple fallback estimate; the browser measurement remains authoritative.
  const lines = label.text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0)
  return { width: label.width, height: lines * BOARD_LABEL_ESTIMATE.height }
}

export function labelShape(label: BoardLabel, measureLabel?: BoardShapesOptions['measureLabel']): LabelShapeResult {
  if (label.size && (label.width === undefined || label.size.width === label.width)) return { shape: label.size, source: 'stored' }
  const measured = measureLabel?.(label.text, labelDirection(label), label.width)
  return measured
    ? { shape: { ...measured, width: label.width ?? measured.width }, source: 'measured' }
    : { shape: estimatedLabelShape(label), source: 'estimated' }
}

export function boardShapes(board: Board, facts: Readonly<Record<string, BoardItemFact>>, options: BoardShapesOptions = {}): ComputedBoardShapes {
  const provisional: string[] = []
  const estimated: string[] = []
  const items = Object.fromEntries(board.items.map((item) => [item.id, itemShape(item, facts, provisional)]))
  const labels = Object.fromEntries(
    board.labels.map((label) => {
      const result = labelShape(label, options.measureLabel)
      if (result.source === 'estimated') estimated.push(label.id)
      return [label.id, result.shape]
    }),
  )
  return { shapes: { items, labels }, provisional, estimated }
}
