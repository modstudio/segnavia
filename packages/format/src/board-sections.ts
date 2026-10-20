import type { Board, BoardSection } from './board.ts'
import { moveItems, moveSection } from './board-edit.ts'
import { type BoardShapes, itemHeight } from './board-geometry.ts'
import type { Box, Point } from './deck.ts'
import { layoutSection } from './board-section-grid.ts'

export const SECTION_PADDING = 24
export const SECTION_TITLE_ROOM = 32
export const SECTION_MIN_SIZE = { width: 240, height: 160 } as const
export const SECTION_GAP = 16
export const MAKE_ROOM_LIMIT = 50

function itemRectangle(board: Board, shapes: BoardShapes, id: string): Box | undefined {
  const item = board.items.find((entry) => entry.id === id)
  if (!item) return undefined
  const shape = shapes.items[id]
  if (!shape) throw new Error(`item "${id}" has no supplied shape; supply shapes.items["${id}"]`)
  return { x: item.x, y: item.y, width: item.width, height: itemHeight(item, shape) }
}

function fittedRectangle(board: Board, shapes: BoardShapes, sectionId: string, excluded: ReadonlySet<string> = new Set()): Box | undefined {
  const section = board.sections.find((entry) => entry.id === sectionId)
  if (!section) return undefined
  const members = section.items
    .filter((id) => !excluded.has(id))
    .map((id) => itemRectangle(board, shapes, id))
    .filter((rectangle): rectangle is Box => rectangle !== undefined)
  if (members.length === 0) return { x: section.rectangle.x, y: section.rectangle.y, ...SECTION_MIN_SIZE }
  const left = Math.min(...members.map((rectangle) => rectangle.x))
  const top = Math.min(...members.map((rectangle) => rectangle.y))
  const right = Math.max(...members.map((rectangle) => rectangle.x + rectangle.width))
  const bottom = Math.max(...members.map((rectangle) => rectangle.y + rectangle.height))
  return {
    x: left - SECTION_PADDING,
    y: top - SECTION_PADDING - SECTION_TITLE_ROOM,
    width: right - left + SECTION_PADDING * 2,
    height: bottom - top + SECTION_PADDING * 2 + SECTION_TITLE_ROOM,
  }
}

export function fitSection(board: Board, shapes: BoardShapes, sectionId: string): Board {
  const rectangle = fittedRectangle(board, shapes, sectionId)
  if (!rectangle) return board
  return { ...board, sections: board.sections.map((section) => (section.id === sectionId ? { ...section, rectangle } : section)) }
}

function contains(rectangle: Box, point: Point): boolean {
  return point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width && point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height
}

export function assignMembership(
  board: Board,
  shapes: BoardShapes,
  ids: readonly string[],
  point: Point,
  startingSections: readonly BoardSection[] = [],
): Board {
  const moved = new Set(ids.filter((id) => board.items.some((item) => item.id === id)))
  let target: string | undefined
  for (const section of board.sections) {
    const rectangle = fittedRectangle(board, shapes, section.id, moved)
    if (rectangle && contains(rectangle, point)) target = section.id
  }
  const assignments = new Map<string, string | undefined>()
  for (const id of moved) {
    const starting = startingSections.find((section) => section.items.includes(id))
    assignments.set(id, starting && contains(starting.rectangle, point) ? starting.id : target)
  }
  return {
    ...board,
    sections: board.sections.map((section) => {
      const items = section.items.filter((id) => !moved.has(id) || assignments.get(id) === section.id)
      const existing = new Set(items)
      const appended = ids.filter((id, index) => moved.has(id) && assignments.get(id) === section.id && !existing.has(id) && ids.indexOf(id) === index)
      return { ...section, items: [...items, ...appended] }
    }),
  }
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function clearingDelta(anchor: Box, neighbor: Box): Point {
  const candidates: Point[] = [
    { x: anchor.x - SECTION_GAP - (neighbor.x + neighbor.width), y: 0 },
    { x: anchor.x + anchor.width + SECTION_GAP - neighbor.x, y: 0 },
    { x: 0, y: anchor.y - SECTION_GAP - (neighbor.y + neighbor.height) },
    { x: 0, y: anchor.y + anchor.height + SECTION_GAP - neighbor.y },
  ]
  return candidates.reduce((best, candidate) => (Math.abs(candidate.x) + Math.abs(candidate.y) < Math.abs(best.x) + Math.abs(best.y) ? candidate : best))
}

type Entity = { kind: 'section' | 'item' | 'label'; id: string }

function entityRectangle(board: Board, shapes: BoardShapes, entity: Entity): Box | undefined {
  if (entity.kind === 'section') return board.sections.find((section) => section.id === entity.id)?.rectangle
  if (entity.kind === 'item') return itemRectangle(board, shapes, entity.id)
  const label = board.labels.find((entry) => entry.id === entity.id)
  if (!label) return undefined
  const shape = shapes.labels[entity.id]
  if (!shape) throw new Error(`label "${entity.id}" has no supplied shape; supply shapes.labels["${entity.id}"]`)
  return { x: label.x, y: label.y, ...shape }
}

function moveEntity(board: Board, entity: Entity, delta: Point): Board {
  if (entity.kind === 'item') return moveItems(board, [entity.id], delta)
  if (entity.kind === 'label') {
    return {
      ...board,
      labels: board.labels.map((label) => (label.id === entity.id ? { ...label, x: label.x + delta.x, y: label.y + delta.y } : label)),
    }
  }
  return moveSection(board, entity.id, delta)
}

function neighbors(board: Board): Entity[] {
  return [
    ...board.sections.map((section): Entity => ({ kind: 'section', id: section.id })),
    ...board.items.map((item): Entity => ({ kind: 'item', id: item.id })),
    ...board.labels.map((label): Entity => ({ kind: 'label', id: label.id })),
  ]
}

interface RoomContext {
  changedSections: ReadonlySet<string>
  protectedItems: ReadonlySet<string>
}

function clearAround(board: Board, shapes: BoardShapes, anchor: Entity, context: RoomContext): { board: Board; moved: Entity[] } {
  const anchorRectangle = entityRectangle(board, shapes, anchor)
  if (!anchorRectangle) return { board, moved: [] }
  const anchorMembers = new Set(anchor.kind === 'section' ? board.sections.find((section) => section.id === anchor.id)?.items : [])
  let next = board
  const moved: Entity[] = []
  for (const neighbor of neighbors(board)) {
    if (neighbor.kind === anchor.kind && neighbor.id === anchor.id) continue
    if (neighbor.kind === 'section' && context.changedSections.has(neighbor.id)) continue
    if (neighbor.kind === 'item' && (context.protectedItems.has(neighbor.id) || anchorMembers.has(neighbor.id))) continue
    const rectangle = entityRectangle(next, shapes, neighbor)
    if (!rectangle || !overlaps(anchorRectangle, rectangle)) continue
    next = moveEntity(next, neighbor, clearingDelta(anchorRectangle, rectangle))
    moved.push(neighbor)
  }
  return { board: next, moved }
}

export function makeRoom(board: Board, shapes: BoardShapes, changed: readonly string[]): Board {
  const changedSections = new Set(changed.filter((id) => board.sections.some((section) => section.id === id)))
  const protectedItems = new Set(board.sections.filter((section) => changedSections.has(section.id)).flatMap((section) => section.items))
  const context = { changedSections, protectedItems }
  let next = board
  let frontier: Entity[] = [...changedSections].map((id) => ({ kind: 'section', id }))
  for (let pass = 0; pass < MAKE_ROOM_LIMIT && frontier.length > 0; pass += 1) {
    const following: Entity[] = []
    for (const anchor of frontier) {
      const cleared = clearAround(next, shapes, anchor, context)
      next = cleared.board
      following.push(...cleared.moved)
    }
    frontier = following.length > 0 ? [...[...changedSections].map((id): Entity => ({ kind: 'section', id })), ...following] : []
  }
  return next
}

function touchedSections(previous: Board, board: Board, touched: readonly string[]): string[] {
  const touchedIds = new Set(touched)
  return [...previous.sections, ...board.sections]
    .filter((section) => touchedIds.has(section.id) || section.items.some((id) => touchedIds.has(id)))
    .map((section) => section.id)
    .filter((id, index, ids) => ids.indexOf(id) === index)
}

function fitSections(board: Board, shapes: BoardShapes, sectionIds: readonly string[]): Board {
  return sectionIds.reduce((value, id) => {
    const section = value.sections.find((entry) => entry.id === id)
    return section?.layout === 'manual' ? fitSection(value, shapes, id) : layoutSection(value, shapes, id)
  }, board)
}

export function fitTouchedSections(previous: Board, board: Board, shapes: BoardShapes, touched: readonly string[]): Board {
  return fitSections(board, shapes, touchedSections(previous, board, touched))
}

export function settleBoard(previous: Board, board: Board, shapes: BoardShapes, touched: readonly string[]): Board {
  const sectionIds = touchedSections(previous, board, touched)
  return makeRoom(fitSections(board, shapes, sectionIds), shapes, sectionIds)
}
