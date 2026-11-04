import type { Board, BoardItem, BoardLabel, BoardSection } from './board.ts'
import { applyBoardOps, type BoardOp, type SectionFields } from './board-ops.ts'

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false
  if (Array.isArray(left) || Array.isArray(right))
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equal(value, right[index]))
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && equal(a[key], b[key]))
}

function sectionFields(section: BoardSection): SectionFields {
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

function structuralChanges(before: readonly { id: string }[], after: readonly { id: string }[]): Set<string> {
  const kept = longestCommonIds(before, after)
  const afterIds = new Set(after.map((entry) => entry.id))
  return new Set(before.filter((entry) => !kept.has(entry.id) || !afterIds.has(entry.id)).map((entry) => entry.id))
}

function addedChanges(before: readonly { id: string }[], after: readonly { id: string }[]): Set<string> {
  const kept = longestCommonIds(before, after)
  const beforeIds = new Set(before.map((entry) => entry.id))
  return new Set(after.filter((entry) => !kept.has(entry.id) || !beforeIds.has(entry.id)).map((entry) => entry.id))
}

function predecessor(entries: readonly { id: string }[], id: string): string | null {
  const at = entries.findIndex((entry) => entry.id === id)
  return at <= 0 ? null : (entries[at - 1]?.id ?? null)
}

function removeEntity<T extends { id: string }>(entries: T[], id: string): T[] {
  return entries.filter((entry) => entry.id !== id)
}

function insertEntity<T extends { id: string }>(entries: T[], entry: T, after: string | null): T[] {
  const at = after === null ? 0 : entries.findIndex((candidate) => candidate.id === after) + 1
  return [...entries.slice(0, at), entry, ...entries.slice(at)]
}

function changed<T extends object>(before: T, after: T, keys: readonly (keyof T)[]): { from: Partial<T>; to: Partial<T> } | null {
  const from: Partial<T> = {}
  const to: Partial<T> = {}
  for (const key of keys)
    if (!equal(before[key], after[key])) {
      from[key] = before[key]
      to[key] = after[key]
    }
  return Object.keys(from).length === 0 ? null : { from, to }
}

interface Working {
  items: BoardItem[]
  labels: BoardLabel[]
  sections: BoardSection[]
}

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
      const at = section.items.indexOf(item)
      ops.push({ type: 'member-set', section: section.id, item, from: { after: at === 0 ? null : (section.items[at - 1] ?? null) }, to: null })
      section.items.splice(at, 1)
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
      ops.push({ type: 'item-remove', id: item.id, item, after: predecessor(working.items, item.id) })
      working.items = removeEntity(working.items, item.id)
    }
  for (const label of [...working.labels])
    if (removedLabels.has(label.id)) {
      ops.push({ type: 'label-remove', id: label.id, label, after: predecessor(working.labels, label.id) })
      working.labels = removeEntity(working.labels, label.id)
    }
  for (const section of [...working.sections])
    if (removedSections.has(section.id)) {
      ops.push({ type: 'section-remove', id: section.id, section: sectionFields(section), after: predecessor(working.sections, section.id) })
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
      const afterId = predecessor(after.sections, section.id)
      ops.push({ type: 'section-add', id: section.id, section: sectionFields(section), after: afterId })
      working.sections = insertEntity(working.sections, { ...section, items: [], cells: undefined }, afterId)
    }
  for (const item of after.items)
    if (addedItems.has(item.id)) {
      const afterId = predecessor(after.items, item.id)
      ops.push({ type: 'item-add', id: item.id, item, after: afterId })
      working.items = insertEntity(working.items, item, afterId)
    }
  for (const label of after.labels)
    if (addedLabels.has(label.id)) {
      const afterId = predecessor(after.labels, label.id)
      ops.push({ type: 'label-add', id: label.id, label, after: afterId })
      working.labels = insertEntity(working.labels, label, afterId)
    }
}

function setRows(working: Working, after: Board, ops: BoardOp[]): void {
  for (const item of working.items) {
    const target = after.items.find((entry) => entry.id === item.id)
    if (!target || equal(item, target)) continue
    const change = changed(item, target, ['kind', 'address', 'x', 'y', 'width'])
    if (change) ops.push({ type: 'item-set', id: item.id, ...change })
  }
  for (const label of working.labels) {
    const target = after.labels.find((entry) => entry.id === label.id)
    if (!target || equal(label, target)) continue
    const change = changed(label, target, ['text', 'x', 'y'])
    if (change) ops.push({ type: 'label-set', id: label.id, ...change })
  }
  for (const section of working.sections) {
    const target = after.sections.find((entry) => entry.id === section.id)
    if (!target) continue
    const currentFields = sectionFields(section)
    const targetFields = sectionFields(target)
    const change = changed(currentFields, targetFields, ['title', 'rectangle', 'layout'])
    if (change) ops.push({ type: 'section-set', id: section.id, ...change })
  }
}

function reconcileSection(section: BoardSection, target: BoardSection, ops: BoardOp[]): void {
  for (let index = 0; index < target.items.length; index += 1) {
    const item = target.items[index] as string
    const at = section.items.indexOf(item)
    const from = at < 0 ? null : { after: at === 0 ? null : (section.items[at - 1] ?? null) }
    const to = { after: index === 0 ? null : (target.items[index - 1] ?? null) }
    if (equal(from, to)) continue
    ops.push({ type: 'member-set', section: section.id, item, from, to })
    if (at >= 0) section.items.splice(at, 1)
    const insertAt = to.after === null ? 0 : section.items.indexOf(to.after) + 1
    section.items.splice(insertAt, 0, item)
  }
  const fromCells = section.cells ?? null
  const toCells = target.cells ?? null
  if (!equal(fromCells, toCells)) ops.push({ type: 'cells-set', section: section.id, from: fromCells, to: toCells })
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
  const removedItems = structuralChanges(before.items, after.items)
  const removedLabels = structuralChanges(before.labels, after.labels)
  const removedSections = structuralChanges(before.sections, after.sections)
  const addedItems = addedChanges(before.items, after.items)
  const addedLabels = addedChanges(before.labels, after.labels)
  const addedSections = addedChanges(before.sections, after.sections)
  removeDependencies(working, after, removedItems, removedSections, ops)
  removeRows(working, removedItems, removedLabels, removedSections, ops)
  addRows(working, after, addedSections, addedItems, addedLabels, ops)
  const boardChange = changed(before, after, ['title', 'direction'])
  if (boardChange) ops.push({ type: 'board-set', ...boardChange })
  setRows(working, after, ops)
  reconcileMembersAndCells(working, after, ops)
  return ops
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
    default:
      return { ...op, from: op.to, to: op.from } as BoardOp
  }
}

export function invertOps(ops: readonly BoardOp[], before: Board): BoardOp[] {
  applyBoardOps(before, ops)
  return [...ops].reverse().map(invertOp)
}
