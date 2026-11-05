import type { Board, BoardItem, BoardLabel, BoardSection } from './board.ts'
import type { BoardEntityRef, BoardItemRef, BoardSectionRef } from './board-commands.ts'
import type { BoardShapes } from './board-geometry.ts'

export class BoardCommandRefusal extends Error {
  constructor(
    message: string,
    readonly clearing: string,
  ) {
    super(message)
  }
}

export function requireItemShape(shapes: BoardShapes, id: string): BoardShapes['items'][string] {
  const shape = shapes.items[id]
  if (!shape) throw new BoardCommandRefusal(`item "${id}" has no resolved shape`, `pass the resolved shape for item "${id}"`)
  return shape
}

export function requireLabelShape(shapes: BoardShapes, id: string): BoardShapes['labels'][string] {
  const shape = shapes.labels[id]
  if (!shape) throw new BoardCommandRefusal(`label "${id}" has no resolved shape`, `pass the resolved shape for label "${id}"`)
  return shape
}

function one<T extends { id: string }>(matches: T[], description: string, clearing: string): T {
  if (matches.length === 0) throw new BoardCommandRefusal(`${description} does not exist`, clearing)
  if (matches.length > 1) throw new BoardCommandRefusal(`${description} is ambiguous (matches ${matches.map((entry) => entry.id).join(', ')})`, clearing)
  return matches[0] as T
}

export function resolveItem(board: Board, ref: BoardItemRef): BoardItem {
  if ('id' in ref)
    return one(
      board.items.filter((item) => item.id === ref.id),
      `item id "${ref.id}"`,
      'pass the id or unique address of an existing item',
    )
  return one(
    board.items.filter((item) => item.address === ref.address),
    `item address "${ref.address}"`,
    'pass an item id or an address that names exactly one item',
  )
}

export function resolveItems(board: Board, refs: readonly BoardItemRef[]): BoardItem[] {
  const items = refs.map((ref) => resolveItem(board, ref))
  const duplicate = items.find((item, index) => items.findIndex((entry) => entry.id === item.id) !== index)
  if (duplicate) throw new BoardCommandRefusal(`item "${duplicate.id}" is named more than once`, 'name every item at most once')
  return items
}

export function resolveSection(board: Board, ref: BoardSectionRef): BoardSection {
  if ('id' in ref)
    return one(
      board.sections.filter((section) => section.id === ref.id),
      `section id "${ref.id}"`,
      'pass the id or unique title of an existing section',
    )
  return one(
    board.sections.filter((section) => section.title === ref.title),
    `section title "${ref.title}"`,
    'pass a section id or a title that names exactly one section',
  )
}

export type ResolvedBoardEntity = { kind: 'item'; value: BoardItem } | { kind: 'section'; value: BoardSection } | { kind: 'label'; value: BoardLabel }

export function resolveEntity(board: Board, ref: BoardEntityRef): ResolvedBoardEntity {
  if ('address' in ref) return { kind: 'item', value: resolveItem(board, ref) }
  if ('title' in ref) return { kind: 'section', value: resolveSection(board, ref) }
  const matches: ResolvedBoardEntity[] = [
    ...board.items.filter((entry) => entry.id === ref.id).map((value): ResolvedBoardEntity => ({ kind: 'item', value })),
    ...board.sections.filter((entry) => entry.id === ref.id).map((value): ResolvedBoardEntity => ({ kind: 'section', value })),
    ...board.labels.filter((entry) => entry.id === ref.id).map((value): ResolvedBoardEntity => ({ kind: 'label', value })),
  ]
  if (matches.length === 0) throw new BoardCommandRefusal(`entity id "${ref.id}" does not exist`, 'pass the id, address, or title of an existing entity')
  return matches[0] as ResolvedBoardEntity
}
