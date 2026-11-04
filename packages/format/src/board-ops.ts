import { Board, type BoardItem, type BoardLabel, type GridCell } from './board.ts'
import type { Box } from './deck.ts'
import type { TextDirection } from './direction.ts'

type BoardFields = { title: string; direction: TextDirection }
type ItemFields = Omit<BoardItem, 'id'>
type LabelFields = Omit<BoardLabel, 'id'>
export interface SectionFields {
  title: string
  rectangle: Box
  layout: 'auto' | 'manual' | null
}
type Change<T> = { from: Partial<T>; to: Partial<T> }
type Positioned = { after: string | null }

export type BoardOp =
  | ({ type: 'board-set' } & Change<BoardFields>)
  | { type: 'item-add'; id: string; item: BoardItem; after: string | null }
  | { type: 'item-remove'; id: string; item: BoardItem; after: string | null }
  | ({ type: 'item-set'; id: string } & Change<ItemFields>)
  | { type: 'label-add'; id: string; label: BoardLabel; after: string | null }
  | { type: 'label-remove'; id: string; label: BoardLabel; after: string | null }
  | ({ type: 'label-set'; id: string } & Change<LabelFields>)
  | { type: 'section-add'; id: string; section: SectionFields; after: string | null }
  | { type: 'section-remove'; id: string; section: SectionFields; after: string | null }
  | ({ type: 'section-set'; id: string } & Change<SectionFields>)
  | { type: 'member-set'; section: string; item: string; from: Positioned | null; to: Positioned | null }
  | { type: 'cells-set'; section: string; from: GridCell[] | null; to: GridCell[] | null }

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false
  if (Array.isArray(left) || Array.isArray(right))
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equal(value, right[index]))
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord)
  return keys.length === Object.keys(rightRecord).length && keys.every((key) => key in rightRecord && equal(leftRecord[key], rightRecord[key]))
}

function refuse(index: number, op: BoardOp, reason: string): never {
  throw new Error(`board op ${index} (${op.type}) refused: ${reason}; diff again from the current board`)
}

function afterOf(ids: readonly string[], id: string): Positioned | null {
  const index = ids.indexOf(id)
  return index < 0 ? null : { after: index === 0 ? null : (ids[index - 1] ?? null) }
}

function insertAfter<T extends { id: string }>(entries: T[], entry: T, after: string | null, index: number, op: BoardOp): T[] {
  const at = after === null ? 0 : entries.findIndex((candidate) => candidate.id === after) + 1
  if (after !== null && at === 0) refuse(index, op, `anchor "${after}" is missing`)
  return [...entries.slice(0, at), entry, ...entries.slice(at)]
}

function checkPosition(entries: readonly { id: string }[], id: string, after: string | null, index: number, op: BoardOp): void {
  const at = entries.findIndex((entry) => entry.id === id)
  if (at < 0) refuse(index, op, `id "${id}" is missing`)
  const actual = at === 0 ? null : entries[at - 1]?.id
  if (actual !== after) refuse(index, op, `id "${id}" is not after ${after === null ? 'the start' : `"${after}"`}`)
}

function checkChange(target: Record<string, unknown>, change: Change<unknown>, index: number, op: BoardOp): void {
  const fromKeys = Object.keys(change.from)
  const toKeys = Object.keys(change.to)
  if (!equal([...fromKeys].sort(), [...toKeys].sort())) refuse(index, op, 'from and to do not name the same fields')
  for (const key of fromKeys) if (!equal(target[key], (change.from as Record<string, unknown>)[key])) refuse(index, op, `field "${key}" does not match from`)
}

function applySet<T extends object>(target: T, change: Change<unknown>, index: number, op: BoardOp): T {
  checkChange(target as Record<string, unknown>, change, index, op)
  const next = { ...target } as Record<string, unknown>
  for (const [key, value] of Object.entries(change.to)) {
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next as T
}

function withSectionFields(section: Board['sections'][number], fields: SectionFields): Board['sections'][number] {
  const { layout: _layout, ...withoutLayout } = section
  return { ...withoutLayout, title: fields.title, rectangle: fields.rectangle, ...(fields.layout === null ? {} : { layout: fields.layout }) }
}

function withCells(section: Board['sections'][number], cells: GridCell[] | null): Board['sections'][number] {
  const { cells: _cells, ...withoutCells } = section
  return { ...withoutCells, ...(cells === null ? {} : { cells }) }
}

function globalIdExists(board: Board, id: string): boolean {
  return board.items.some((entry) => entry.id === id) || board.labels.some((entry) => entry.id === id) || board.sections.some((entry) => entry.id === id)
}

type OpOf<T extends BoardOp['type']> = Extract<BoardOp, { type: T }>

function applyAdd(board: Board, op: OpOf<'item-add' | 'label-add' | 'section-add'>, index: number): Board {
  if (op.type === 'item-add') {
    if (globalIdExists(board, op.id)) refuse(index, op, `added id "${op.id}" already exists`)
    if (op.item.id !== op.id) refuse(index, op, `item id "${op.item.id}" does not match "${op.id}"`)
    return { ...board, items: insertAfter(board.items, op.item, op.after, index, op) }
  }
  if (op.type === 'label-add') {
    if (globalIdExists(board, op.id)) refuse(index, op, `added id "${op.id}" already exists`)
    if (op.label.id !== op.id) refuse(index, op, `label id "${op.label.id}" does not match "${op.id}"`)
    return { ...board, labels: insertAfter(board.labels, op.label, op.after, index, op) }
  }
  if (globalIdExists(board, op.id)) refuse(index, op, `added id "${op.id}" already exists`)
  return {
    ...board,
    sections: insertAfter(
      board.sections,
      { id: op.id, title: op.section.title, rectangle: op.section.rectangle, items: [], ...(op.section.layout === null ? {} : { layout: op.section.layout }) },
      op.after,
      index,
      op,
    ),
  }
}

function applyRemove(board: Board, op: OpOf<'item-remove' | 'label-remove' | 'section-remove'>, index: number): Board {
  if (op.type === 'item-remove') {
    checkPosition(board.items, op.id, op.after, index, op)
    const item = board.items.find((entry) => entry.id === op.id)
    if (!equal(item, op.item)) refuse(index, op, `item "${op.id}" does not match its prior value`)
    if (board.sections.some((section) => section.items.includes(op.id))) refuse(index, op, `item "${op.id}" is still a section member`)
    return { ...board, items: board.items.filter((entry) => entry.id !== op.id) }
  }
  if (op.type === 'label-remove') {
    checkPosition(board.labels, op.id, op.after, index, op)
    const label = board.labels.find((entry) => entry.id === op.id)
    if (!equal(label, op.label)) refuse(index, op, `label "${op.id}" does not match its prior value`)
    return { ...board, labels: board.labels.filter((entry) => entry.id !== op.id) }
  }
  checkPosition(board.sections, op.id, op.after, index, op)
  const section = board.sections.find((entry) => entry.id === op.id)
  if (!section) refuse(index, op, `section "${op.id}" is missing`)
  if (section.items.length > 0 || section.cells !== undefined) refuse(index, op, `section "${op.id}" still has members or cells`)
  const fields = { title: section.title, rectangle: section.rectangle, layout: section.layout ?? null }
  if (!equal(fields, op.section)) refuse(index, op, `section "${op.id}" does not match its prior value`)
  return { ...board, sections: board.sections.filter((entry) => entry.id !== op.id) }
}

function applyItemSet(board: Board, op: OpOf<'item-set'>, index: number): Board {
  const at = board.items.findIndex((entry) => entry.id === op.id)
  if (at < 0) refuse(index, op, `item "${op.id}" is missing`)
  const items = [...board.items]
  items[at] = applySet(items[at] as BoardItem, op, index, op)
  return { ...board, items }
}

function applyLabelSet(board: Board, op: OpOf<'label-set'>, index: number): Board {
  const at = board.labels.findIndex((entry) => entry.id === op.id)
  if (at < 0) refuse(index, op, `label "${op.id}" is missing`)
  const labels = [...board.labels]
  labels[at] = applySet(labels[at] as BoardLabel, op, index, op)
  return { ...board, labels }
}

function sectionEntry(board: Board, id: string, op: BoardOp, index: number): [number, Board['sections'][number]] {
  const at = board.sections.findIndex((entry) => entry.id === id)
  if (at < 0) refuse(index, op, `section "${id}" is missing`)
  return [at, board.sections[at] as Board['sections'][number]]
}

function applySectionSet(board: Board, op: OpOf<'section-set'>, index: number): Board {
  const [at, section] = sectionEntry(board, op.id, op, index)
  const fields = { title: section.title, rectangle: section.rectangle, layout: section.layout ?? null }
  const sections = [...board.sections]
  sections[at] = withSectionFields(section, applySet(fields, op, index, op))
  return { ...board, sections }
}

function applyMemberSet(board: Board, op: OpOf<'member-set'>, index: number): Board {
  const [sectionAt, section] = sectionEntry(board, op.section, op, index)
  const actual = afterOf(section.items, op.item)
  if (!equal(actual, op.from)) refuse(index, op, `section "${op.section}" member "${op.item}" does not match from`)
  let items = section.items.filter((id) => id !== op.item)
  if (op.to) {
    if (!board.items.some((item) => item.id === op.item)) refuse(index, op, `item "${op.item}" is missing`)
    const at = op.to.after === null ? 0 : items.indexOf(op.to.after) + 1
    if (op.to.after !== null && at === 0) refuse(index, op, `anchor "${op.to.after}" is missing`)
    items = [...items.slice(0, at), op.item, ...items.slice(at)]
  }
  const sections = [...board.sections]
  sections[sectionAt] = { ...section, items }
  return { ...board, sections }
}

function applyCellsSet(board: Board, op: OpOf<'cells-set'>, index: number): Board {
  const [at, section] = sectionEntry(board, op.section, op, index)
  if (!equal(section.cells ?? null, op.from)) refuse(index, op, `section "${op.section}" cells do not match from`)
  const sections = [...board.sections]
  sections[at] = withCells(section, op.to)
  return { ...board, sections }
}

function applyOne(board: Board, op: BoardOp, index: number): Board {
  switch (op.type) {
    case 'item-add':
    case 'label-add':
    case 'section-add':
      return applyAdd(board, op, index)
    case 'item-remove':
    case 'label-remove':
    case 'section-remove':
      return applyRemove(board, op, index)
    case 'board-set':
      return applySet(board, op, index, op)
    case 'item-set':
      return applyItemSet(board, op, index)
    case 'label-set':
      return applyLabelSet(board, op, index)
    case 'section-set':
      return applySectionSet(board, op, index)
    case 'member-set':
      return applyMemberSet(board, op, index)
    case 'cells-set':
      return applyCellsSet(board, op, index)
  }
}

export function applyBoardOps(board: Board, ops: readonly BoardOp[]): Board {
  let next = board
  for (let index = 0; index < ops.length; index += 1) next = applyOne(next, ops[index] as BoardOp, index)
  try {
    return Board.parse(next)
  } catch (error) {
    const index = Math.max(0, ops.length - 1)
    const op = ops[index]
    if (!op) throw error
    refuse(index, op, `result is not a valid board (${error instanceof Error ? error.message : String(error)})`)
  }
}
