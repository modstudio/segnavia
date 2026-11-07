import { z } from 'zod'
import { Board, BoardItem, BoardLabel, BoardProperties, BoardSection, type Board as BoardValue, GridCell } from './board.ts'
import { insertAfter, predecessor } from './board-op-anchor.ts'
import { sameValue } from './board-op-equal.ts'

const BoardFields = BoardProperties
const ItemFields = BoardItem.omit({ id: true })
const LabelFields = BoardLabel.omit({ id: true })
export const SectionFields = BoardSection.omit({ id: true, items: true, cells: true }).extend({ layout: BoardSection.shape.layout.unwrap().nullable() })
export type SectionFields = z.infer<typeof SectionFields>

const Positioned = z.object({ after: z.string().nullable() })
const boardChange = z.object({ from: BoardFields.partial(), to: BoardFields.partial() })
const itemChange = z.object({ from: ItemFields.partial(), to: ItemFields.partial() })
const labelChange = z.object({ from: LabelFields.partial(), to: LabelFields.partial() })
const sectionChange = z.object({ from: SectionFields.partial(), to: SectionFields.partial() })

export const BoardOp = z.discriminatedUnion('type', [
  z.object({ type: z.literal('board-set'), ...boardChange.shape }),
  z.object({ type: z.literal('item-add'), id: z.string(), item: BoardItem, after: z.string().nullable() }),
  z.object({ type: z.literal('item-remove'), id: z.string(), item: BoardItem, after: z.string().nullable() }),
  z.object({ type: z.literal('item-set'), id: z.string(), ...itemChange.shape }),
  z.object({ type: z.literal('label-add'), id: z.string(), label: BoardLabel, after: z.string().nullable() }),
  z.object({ type: z.literal('label-remove'), id: z.string(), label: BoardLabel, after: z.string().nullable() }),
  z.object({ type: z.literal('label-set'), id: z.string(), ...labelChange.shape }),
  z.object({ type: z.literal('section-add'), id: z.string(), section: SectionFields, after: z.string().nullable() }),
  z.object({ type: z.literal('section-remove'), id: z.string(), section: SectionFields, after: z.string().nullable() }),
  z.object({ type: z.literal('section-set'), id: z.string(), ...sectionChange.shape }),
  z.object({ type: z.literal('member-set'), section: z.string(), item: z.string(), from: Positioned.nullable(), to: Positioned.nullable() }),
  z.object({ type: z.literal('cells-set'), section: z.string(), from: z.array(GridCell).nullable(), to: z.array(GridCell).nullable() }),
])
export type BoardOp = z.infer<typeof BoardOp>

type Change<T> = { from: Partial<T>; to: Partial<T> }
type OpOf<T extends BoardOp['type']> = Extract<BoardOp, { type: T }>

function refuse(index: number, op: BoardOp, reason: string): never {
  throw new Error(`board op ${index} (${op.type}) refused: ${reason}; diff again from the current board`)
}

function malformedType(op: unknown): string {
  if (typeof op !== 'object' || op === null || typeof (op as { type?: unknown }).type !== 'string') return 'unknown'
  return (op as { type: string }).type
}

function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.length > 0 ? `${issue.path.join('.')} ` : ''}${issue.message}`).join('; ')
}

function parseOps(ops: readonly BoardOp[]): BoardOp[] {
  return (ops as readonly unknown[]).map((op, index) => {
    const result = BoardOp.safeParse(op)
    if (result.success) return result.data
    throw new Error(`board op ${index} (${malformedType(op)}) refused: ${validationMessage(result.error)}; diff again from the current board`)
  })
}

function checkPosition(entries: readonly { id: string }[], id: string, after: string | null, index: number, op: BoardOp): void {
  if (!entries.some((entry) => entry.id === id)) refuse(index, op, `id "${id}" is missing`)
  const actual = predecessor(entries, id, (entry) => entry.id)
  if (actual !== after) refuse(index, op, `id "${id}" is not after ${after === null ? 'the start' : `"${after}"`}`)
}

function checkChange(target: Record<string, unknown>, change: Change<unknown>, index: number, op: BoardOp): void {
  const fromKeys = Object.keys(change.from)
  const toKeys = Object.keys(change.to)
  if (!sameValue([...fromKeys].sort(), [...toKeys].sort())) refuse(index, op, 'from and to do not name the same fields')
  for (const key of fromKeys)
    if (!sameValue(target[key], (change.from as Record<string, unknown>)[key])) refuse(index, op, `field "${key}" does not match from`)
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

function sectionFields(section: BoardValue['sections'][number]): SectionFields {
  return { title: section.title, rectangle: section.rectangle, layout: section.layout ?? null }
}

function withSectionFields(section: BoardValue['sections'][number], fields: SectionFields): BoardValue['sections'][number] {
  const { layout: _layout, ...withoutLayout } = section
  return { ...withoutLayout, title: fields.title, rectangle: fields.rectangle, ...(fields.layout === null ? {} : { layout: fields.layout }) }
}

function withCells(section: BoardValue['sections'][number], cells: BoardValue['sections'][number]['cells'] | null): BoardValue['sections'][number] {
  const { cells: _cells, ...withoutCells } = section
  return { ...withoutCells, ...(cells === null ? {} : { cells }) }
}

function globalIdExists(board: BoardValue, id: string): boolean {
  return board.items.some((entry) => entry.id === id) || board.labels.some((entry) => entry.id === id) || board.sections.some((entry) => entry.id === id)
}

function addAfter<T extends { id: string }>(entries: readonly T[], entry: T, after: string | null, index: number, op: BoardOp): T[] {
  return insertAfter(
    entries,
    entry,
    after,
    (candidate) => candidate.id,
    (reason) => refuse(index, op, reason),
  )
}

function applyAdd(board: BoardValue, op: OpOf<'item-add' | 'label-add' | 'section-add'>, index: number): BoardValue {
  if (globalIdExists(board, op.id)) refuse(index, op, `added id "${op.id}" already exists`)
  if (op.type === 'item-add') {
    if (op.item.id !== op.id) refuse(index, op, `item id "${op.item.id}" does not match "${op.id}"`)
    return { ...board, items: addAfter(board.items, op.item, op.after, index, op) }
  }
  if (op.type === 'label-add') {
    if (op.label.id !== op.id) refuse(index, op, `label id "${op.label.id}" does not match "${op.id}"`)
    return { ...board, labels: addAfter(board.labels, op.label, op.after, index, op) }
  }
  const section = {
    id: op.id,
    title: op.section.title,
    rectangle: op.section.rectangle,
    items: [],
    ...(op.section.layout === null ? {} : { layout: op.section.layout }),
  }
  return { ...board, sections: addAfter(board.sections, section, op.after, index, op) }
}

function applyRemove(board: BoardValue, op: OpOf<'item-remove' | 'label-remove' | 'section-remove'>, index: number): BoardValue {
  if (op.type === 'item-remove') {
    checkPosition(board.items, op.id, op.after, index, op)
    const item = board.items.find((entry) => entry.id === op.id)
    if (!sameValue(item, op.item)) refuse(index, op, `item "${op.id}" does not match its prior value`)
    if (board.sections.some((section) => section.items.includes(op.id))) refuse(index, op, `item "${op.id}" is still a section member`)
    return { ...board, items: board.items.filter((entry) => entry.id !== op.id) }
  }
  if (op.type === 'label-remove') {
    checkPosition(board.labels, op.id, op.after, index, op)
    const label = board.labels.find((entry) => entry.id === op.id)
    if (!sameValue(label, op.label)) refuse(index, op, `label "${op.id}" does not match its prior value`)
    return { ...board, labels: board.labels.filter((entry) => entry.id !== op.id) }
  }
  checkPosition(board.sections, op.id, op.after, index, op)
  const section = board.sections.find((entry) => entry.id === op.id)
  if (!section) refuse(index, op, `section "${op.id}" is missing`)
  if (section.items.length > 0 || (section.cells?.length ?? 0) > 0) refuse(index, op, `section "${op.id}" still has members or cells`)
  if (!sameValue(sectionFields(section), op.section)) refuse(index, op, `section "${op.id}" does not match its prior value`)
  return { ...board, sections: board.sections.filter((entry) => entry.id !== op.id) }
}

function applyItemSet(board: BoardValue, op: OpOf<'item-set'>, index: number): BoardValue {
  const at = board.items.findIndex((entry) => entry.id === op.id)
  if (at < 0) refuse(index, op, `item "${op.id}" is missing`)
  const items = [...board.items]
  items[at] = applySet(items[at] as BoardValue['items'][number], op, index, op)
  return { ...board, items }
}

function applyLabelSet(board: BoardValue, op: OpOf<'label-set'>, index: number): BoardValue {
  const at = board.labels.findIndex((entry) => entry.id === op.id)
  if (at < 0) refuse(index, op, `label "${op.id}" is missing`)
  const labels = [...board.labels]
  labels[at] = applySet(labels[at] as BoardValue['labels'][number], op, index, op)
  return { ...board, labels }
}

function sectionEntry(board: BoardValue, id: string, op: BoardOp, index: number): [number, BoardValue['sections'][number]] {
  const at = board.sections.findIndex((entry) => entry.id === id)
  if (at < 0) refuse(index, op, `section "${id}" is missing`)
  return [at, board.sections[at] as BoardValue['sections'][number]]
}

function applySectionSet(board: BoardValue, op: OpOf<'section-set'>, index: number): BoardValue {
  const [at, section] = sectionEntry(board, op.id, op, index)
  const sections = [...board.sections]
  sections[at] = withSectionFields(section, applySet(sectionFields(section), op, index, op))
  return { ...board, sections }
}

function applyMemberSet(board: BoardValue, op: OpOf<'member-set'>, index: number): BoardValue {
  const [sectionAt, section] = sectionEntry(board, op.section, op, index)
  const actual = section.items.includes(op.item) ? { after: predecessor(section.items, op.item, (id) => id) } : null
  if (!sameValue(actual, op.from)) refuse(index, op, `section "${op.section}" member "${op.item}" does not match from`)
  let items = section.items.filter((id) => id !== op.item)
  if (op.to) {
    if (!board.items.some((item) => item.id === op.item)) refuse(index, op, `item "${op.item}" is missing`)
    items = insertAfter(
      items,
      op.item,
      op.to.after,
      (id) => id,
      (reason) => refuse(index, op, reason),
    )
  }
  const sections = [...board.sections]
  sections[sectionAt] = { ...section, items }
  return { ...board, sections }
}

function applyCellsSet(board: BoardValue, op: OpOf<'cells-set'>, index: number): BoardValue {
  const [at, section] = sectionEntry(board, op.section, op, index)
  if (!sameValue(section.cells ?? null, op.from)) refuse(index, op, `section "${op.section}" cells do not match from`)
  const sections = [...board.sections]
  sections[at] = withCells(section, op.to)
  return { ...board, sections }
}

function applyOne(board: BoardValue, op: BoardOp, index: number): BoardValue {
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

export function applyBoardOps(board: BoardValue, ops: readonly BoardOp[]): BoardValue {
  const parsedOps = parseOps(ops)
  let next = board
  for (let index = 0; index < parsedOps.length; index += 1) next = applyOne(next, parsedOps[index] as BoardOp, index)
  const result = Board.safeParse(next)
  if (result.success) return result.data
  throw new Error(`board op list refused: the result is not a valid board (${validationMessage(result.error)}); diff again from the current board`)
}

function invertOp(op: BoardOp): BoardOp {
  switch (op.type) {
    case 'item-add':
      return { ...op, type: 'item-remove' }
    case 'item-remove':
      return { ...op, type: 'item-add' }
    case 'label-add':
      return { ...op, type: 'label-remove' }
    case 'label-remove':
      return { ...op, type: 'label-add' }
    case 'section-add':
      return { ...op, type: 'section-remove' }
    case 'section-remove':
      return { ...op, type: 'section-add' }
    case 'board-set':
      return { ...op, from: op.to, to: op.from }
    case 'item-set':
      return { ...op, from: op.to, to: op.from }
    case 'label-set':
      return { ...op, from: op.to, to: op.from }
    case 'section-set':
      return { ...op, from: op.to, to: op.from }
    case 'member-set':
      return { ...op, from: op.to, to: op.from }
    case 'cells-set':
      return { ...op, from: op.to, to: op.from }
  }
}

export function invertBoardOps(ops: readonly BoardOp[], before: BoardValue): BoardOp[] {
  applyBoardOps(before, ops)
  return [...ops].reverse().map(invertOp)
}
