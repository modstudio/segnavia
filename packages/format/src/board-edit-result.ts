import type { Board } from './board.ts'
import type { BoardShapes } from './board-geometry.ts'
import type { BoardOp } from './board-ops.ts'
import type { Box } from './deck.ts'

export type BoardChangedKind = 'item' | 'section' | 'label'
export interface BoardChangedEntity {
  kind: BoardChangedKind
  id: string
  box?: Box
}

export interface BoardEditAdjustment {
  command: number
  kind: string
  id: string
  detail: string
  box?: Box
}

export interface BoardEditSuccess {
  ok: true
  board: Board
  ops: BoardOp[]
  changed: BoardChangedEntity[]
  adjustments: BoardEditAdjustment[]
  detail: 'concise' | 'full'
}

export interface BoardEditFailure {
  ok: false
  refusal: string
}

export type BoardEditResult = BoardEditSuccess | BoardEditFailure

function boxes(board: Board, shapes: BoardShapes): Map<string, { kind: BoardChangedKind; box: Box }> {
  const result = new Map<string, { kind: BoardChangedKind; box: Box }>()
  for (const item of board.items) {
    const shape = shapes.items[item.id]
    if (shape) result.set(item.id, { kind: 'item', box: { x: item.x, y: item.y, width: item.width, height: (item.width * shape.height) / shape.width } })
  }
  for (const section of board.sections) result.set(section.id, { kind: 'section', box: section.rectangle })
  for (const label of board.labels) {
    const shape = shapes.labels[label.id]
    if (shape) result.set(label.id, { kind: 'label', box: { x: label.x, y: label.y, ...shape } })
  }
  return result
}

function sameBox(left: Box | undefined, right: Box | undefined): boolean {
  return !!left && !!right && left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
}

export function changedEntities(before: Board, after: Board, shapes: BoardShapes, detail: 'concise' | 'full'): BoardChangedEntity[] {
  const previous = boxes(before, shapes)
  return [...boxes(after, shapes)].flatMap(([id, current]) => {
    if (sameBox(previous.get(id)?.box, current.box)) return []
    return [{ kind: current.kind, id, ...(detail === 'full' ? { box: current.box } : {}) }]
  })
}

export function entityBox(board: Board, shapes: BoardShapes, kind: BoardChangedKind, id: string): Box | undefined {
  return boxes(board, shapes).get(id)?.kind === kind ? boxes(board, shapes).get(id)?.box : undefined
}
