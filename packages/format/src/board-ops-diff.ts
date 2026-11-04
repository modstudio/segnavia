import { type Board, BoardItem, BoardLabel, BoardProperties, BoardSection, type BoardSection as BoardSectionValue } from './board.ts'
import { insertAfter, predecessor } from './board-op-anchor.ts'
import { sameValue } from './board-op-equal.ts'
import type { BoardOp, SectionFields } from './board-ops.ts'

const ITEM_FIELDS = BoardItem.keyof().options.filter((key) => key !== 'id') as Exclude<keyof Board['items'][number], 'id'>[]
const LABEL_FIELDS = BoardLabel.keyof().options.filter((key) => key !== 'id') as Exclude<keyof Board['labels'][number], 'id'>[]
const SECTION_FIELDS = BoardSection.keyof().options.filter((key) => !['id', 'items', 'cells'].includes(key)) as (keyof SectionFields)[]
const BOARD_FIELDS = BoardProperties.keyof().options as (keyof Pick<Board, 'title' | 'direction'>)[]

function sectionFields(section: BoardSectionValue): SectionFields {
  return { title: section.title, rectangle: section.rectangle, layout: section.layout ?? null }
}

function longestCommonIds(before: readonly { id: string }[], after: readonly { id: string }[]): Set<string> {
  const right = new Set(after.map((entry) => entry.id))
  const left = before.filter((entry) => right.has(entry.id))
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(after.length + 1).fill(0))
  for (let i = left.length - 1; i >= 0; i -= 1)
    for (let j = after.length - 1; j >= 0; j -= 1)
      (table[i] as number[])[j] = left[i]?.id === after[j]?.id ? 1 + (table[i + 1]?.[j + 1] ?? 0) : Math.max(table[i + 1]?.[j] ?? 0, table[i]?.[j + 1] ?? 0)
  const kept = new Set<string>()
  let i = 0
  let j = 0
  while (i < left.length && j < after.length) {
    if (left[i]?.id === after[j]?.id) {
      kept.add((left[i] as { id: string }).id)
      i += 1
      j += 1
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) i += 1
    else j += 1
  }
  return kept
}

function changedIds(before: readonly { id: string }[], after: readonly { id: string }[]): { removed: Set<string>; added: Set<string> } {
  const kept = longestCommonIds(before, after)
  return {
    removed: new Set(before.filter((entry) => !kept.has(entry.id)).map((entry) => entry.id)),
    added: new Set(after.filter((entry) => !kept.has(entry.id)).map((entry) => entry.id)),
  }
}

function removeEntity<T extends { id: string }>(entries: T[], id: string): T[] {
  return entries.filter((entry) => entry.id !== id)
}

function insertEntity<T extends { id: string }>(entries: T[], entry: T, after: string | null): T[] {
  return insertAfter(
    entries,
    entry,
    after,
    (candidate) => candidate.id,
    (reason) => {
      throw new Error(`diffBoards invariant refused: ${reason}`)
    },
  )
}

function changed<T extends object>(before: T, after: T, keys: readonly (keyof T)[]): { from: Partial<T>; to: Partial<T> } | null {
  const from: Partial<T> = {}
  const to: Partial<T> = {}
  for (const key of keys)
    if (!sameValue(before[key], after[key])) {
      from[key] = before[key]
      to[key] = after[key]
    }
  return Object.keys(from).length === 0 ? null : { from, to }
}

type Working = Pick<Board, 'items' | 'labels' | 'sections'>

function removeDependencies(working: Working, after: Board, removedItems: ReadonlySet<string>, removedSections: ReadonlySet<string>, ops: BoardOp[]): void {
  const afterSections = new Map(after.sections.map((section) => [section.id, section]))
  for (const section of working.sections) {
    if (removedSections.has(section.id) && section.cells !== undefined) {
      ops.push({ type: 'cells-set', section: section.id, from: section.cells, to: null })
      delete section.cells
    }
    const target = afterSections.get(section.id)
    for (const item of [...section.items]) {
      if (!removedSections.has(section.id) && !removedItems.has(item) && target?.items.includes(item)) continue
      ops.push({ type: 'member-set', section: section.id, item, from: { after: predecessor(section.items, item, (id) => id) }, to: null })
      section.items = section.items.filter((id) => id !== item)
    }
  }
}

function removeRows(
  working: Working,
  removedItems: ReadonlySet<string>,
  removedLabels: ReadonlySet<string>,
  removedSections: ReadonlySet<string>,
  ops: BoardOp[],
): void {
  for (const item of [...working.items])
    if (removedItems.has(item.id)) {
      ops.push({ type: 'item-remove', id: item.id, item, after: predecessor(working.items, item.id, (entry) => entry.id) })
      working.items = removeEntity(working.items, item.id)
    }
  for (const label of [...working.labels])
    if (removedLabels.has(label.id)) {
      ops.push({ type: 'label-remove', id: label.id, label, after: predecessor(working.labels, label.id, (entry) => entry.id) })
      working.labels = removeEntity(working.labels, label.id)
    }
  for (const section of [...working.sections])
    if (removedSections.has(section.id)) {
      ops.push({
        type: 'section-remove',
        id: section.id,
        section: sectionFields(section),
        after: predecessor(working.sections, section.id, (entry) => entry.id),
      })
      working.sections = removeEntity(working.sections, section.id)
    }
}

function addRows(
  working: Working,
  after: Board,
  addedSections: ReadonlySet<string>,
  addedItems: ReadonlySet<string>,
  addedLabels: ReadonlySet<string>,
  ops: BoardOp[],
): void {
  for (const section of after.sections)
    if (addedSections.has(section.id)) {
      const afterId = predecessor(after.sections, section.id, (entry) => entry.id)
      ops.push({ type: 'section-add', id: section.id, section: sectionFields(section), after: afterId })
      working.sections = insertEntity(working.sections, { ...section, items: [], cells: undefined }, afterId)
    }
  for (const item of after.items)
    if (addedItems.has(item.id)) {
      const afterId = predecessor(after.items, item.id, (entry) => entry.id)
      ops.push({ type: 'item-add', id: item.id, item, after: afterId })
      working.items = insertEntity(working.items, item, afterId)
    }
  for (const label of after.labels)
    if (addedLabels.has(label.id)) {
      const afterId = predecessor(after.labels, label.id, (entry) => entry.id)
      ops.push({ type: 'label-add', id: label.id, label, after: afterId })
      working.labels = insertEntity(working.labels, label, afterId)
    }
}

function setRows(working: Working, after: Board, ops: BoardOp[]): void {
  for (const item of working.items) {
    const target = after.items.find((entry) => entry.id === item.id)
    if (!target) continue
    const change = changed(item, target, ITEM_FIELDS)
    if (change) ops.push({ type: 'item-set', id: item.id, ...change })
  }
  for (const label of working.labels) {
    const target = after.labels.find((entry) => entry.id === label.id)
    if (!target) continue
    const change = changed(label, target, LABEL_FIELDS)
    if (change) ops.push({ type: 'label-set', id: label.id, ...change })
  }
  for (const section of working.sections) {
    const target = after.sections.find((entry) => entry.id === section.id)
    if (!target) continue
    const change = changed(sectionFields(section), sectionFields(target), SECTION_FIELDS)
    if (change) ops.push({ type: 'section-set', id: section.id, ...change })
  }
}

function reconcileSection(section: BoardSectionValue, target: BoardSectionValue, ops: BoardOp[]): void {
  for (let index = 0; index < target.items.length; index += 1) {
    const item = target.items[index] as string
    const from = section.items.includes(item) ? { after: predecessor(section.items, item, (id) => id) } : null
    const to = { after: index === 0 ? null : (target.items[index - 1] ?? null) }
    if (sameValue(from, to)) continue
    ops.push({ type: 'member-set', section: section.id, item, from, to })
    const withoutItem = section.items.filter((id) => id !== item)
    section.items = insertAfter(
      withoutItem,
      item,
      to.after,
      (id) => id,
      (reason) => {
        throw new Error(`diffBoards invariant refused: ${reason}`)
      },
    )
  }
  const fromCells = section.cells ?? null
  const toCells = target.cells ?? null
  if (!sameValue(fromCells, toCells)) ops.push({ type: 'cells-set', section: section.id, from: fromCells, to: toCells })
}

function reconcileMembersAndCells(working: Working, after: Board, ops: BoardOp[]): void {
  for (const target of after.sections) {
    const section = working.sections.find((entry) => entry.id === target.id)
    if (section) reconcileSection(section, target, ops)
  }
}

export function diffBoards(before: Board, after: Board): BoardOp[] {
  const ops: BoardOp[] = []
  const working: Working = structuredClone(before)
  const items = changedIds(before.items, after.items)
  const labels = changedIds(before.labels, after.labels)
  const sections = changedIds(before.sections, after.sections)
  removeDependencies(working, after, items.removed, sections.removed, ops)
  removeRows(working, items.removed, labels.removed, sections.removed, ops)
  addRows(working, after, sections.added, items.added, labels.added, ops)
  const boardChange = changed(before, after, BOARD_FIELDS)
  if (boardChange) ops.push({ type: 'board-set', ...boardChange })
  setRows(working, after, ops)
  reconcileMembersAndCells(working, after, ops)
  return ops
}
