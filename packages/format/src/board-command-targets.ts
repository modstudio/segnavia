import type { Board } from './board.ts'
import { BoardCommandRefusal, requireItemShape, requireLabelShape, resolveEntity, resolveItem, resolveSection } from './board-command-resolvers.ts'
import type { BoardTarget, PlacementTarget } from './board-commands.ts'
import { moveItems, moveSection } from './board-edit.ts'
import { type BoardShapes, boardBounds, itemRectangle, labelRectangle } from './board-geometry.ts'
import { gridDropTarget, insertIntoGrid, removeFromGrid } from './board-section-grid.ts'
import { assignMembership, overlaps, SECTION_GAP, SECTION_PADDING, SECTION_TITLE_ROOM } from './board-sections.ts'
import type { Box, Point } from './deck.ts'

function itemBox(board: Board, shapes: BoardShapes, id: string): Box {
  const item = board.items.find((entry) => entry.id === id)
  requireItemShape(shapes, id)
  if (!item) throw new BoardCommandRefusal(`item id "${id}" does not exist`, 'pass the id or unique address of an existing item')
  return itemRectangle(item, shapes)
}

function resolvedEntityBox(board: Board, shapes: BoardShapes, target: ReturnType<typeof resolveEntity>): Box {
  if (target.kind === 'section') return target.value.rectangle
  if (target.kind === 'item') return itemBox(board, shapes, target.value.id)
  requireLabelShape(shapes, target.value.id)
  return labelRectangle(target.value, shapes)
}

function translate(board: Board, ids: readonly string[], point: Point): Board {
  const first = board.items.find((item) => item.id === ids[0])
  if (!first) return board
  return moveItems(board, ids, { x: point.x - first.x, y: point.y - first.y })
}

export type BoardPlacementSubject = { kind: 'items'; ids: readonly string[] } | { kind: 'section' | 'label'; id: string }

function subjectBox(board: Board, shapes: BoardShapes, subject: BoardPlacementSubject): Box {
  if (subject.kind === 'items') return itemBox(board, shapes, subject.ids[0] as string)
  if (subject.kind === 'section') {
    const section = resolveSection(board, { id: subject.id })
    return section.rectangle
  }
  const label = board.labels.find((entry) => entry.id === subject.id)
  if (!label) throw new BoardCommandRefusal(`label id "${subject.id}" does not exist`, 'pass the id of an existing label')
  requireLabelShape(shapes, subject.id)
  return labelRectangle(label, shapes)
}

function moveSubjectTo(board: Board, shapes: BoardShapes, subject: BoardPlacementSubject, point: Point): Board {
  const box = subjectBox(board, shapes, subject)
  const delta = { x: point.x - box.x, y: point.y - box.y }
  if (subject.kind === 'items') return moveItems(board, subject.ids, delta)
  if (subject.kind === 'section') return moveSection(board, subject.id, delta)
  return {
    ...board,
    labels: board.labels.map((label) => (label.id === subject.id ? { ...label, x: label.x + delta.x, y: label.y + delta.y } : label)),
  }
}

function unsection(board: Board, shapes: BoardShapes, ids: readonly string[]): Board {
  return removeFromGrid(board, shapes, ids)
}

function appendPoint(board: Board, shapes: BoardShapes, id: string, sectionId?: string): Point {
  const item = itemBox(board, shapes, id)
  if (sectionId) {
    const section = board.sections.find((entry) => entry.id === sectionId)
    if (section) {
      const members = section.items.filter((member) => member !== id).map((member) => itemBox(board, shapes, member))
      return {
        x: board.direction === 'rtl' ? section.rectangle.x + section.rectangle.width - SECTION_PADDING - item.width : section.rectangle.x + SECTION_PADDING,
        y: members.length ? Math.max(...members.map((box) => box.y + box.height)) + SECTION_GAP : section.rectangle.y + SECTION_PADDING + SECTION_TITLE_ROOM,
      }
    }
  }
  if (board.items.length + board.labels.length + board.sections.length <= 1) return { x: 0, y: 0 }
  const bounds = boardBounds(board, shapes)
  return { x: board.direction === 'rtl' ? bounds.x - SECTION_GAP - item.width : bounds.x + bounds.width + SECTION_GAP, y: bounds.y }
}

function sectionTarget(board: Board, shapes: BoardShapes, ids: readonly string[], target: Extract<BoardTarget, { section: unknown }>): Board {
  const section = resolveSection(board, target.section)
  const anchorRef = target.after ?? target.before
  const anchor = anchorRef ? resolveItem(board, anchorRef) : undefined
  if (anchor && !section.items.includes(anchor.id))
    throw new BoardCommandRefusal(`item "${anchor.id}" is not in section "${section.id}"`, `pass an ordering anchor in section "${section.id}"`)
  const removed = removeFromGrid(board, shapes, ids)
  if (section.layout !== 'manual') {
    const remaining = removed.sections.find((entry) => entry.id === section.id)?.items ?? []
    const gridTarget = anchor
      ? { anchor: anchor.id, side: target.before ? ('before' as const) : ('after' as const), axis: 'row' as const }
      : remaining.length
        ? { anchor: remaining.at(-1) as string, side: 'after' as const, axis: 'row' as const }
        : { row: 0, column: 0, axis: 'cell' as const }
    return insertIntoGrid(removed, shapes, section.id, ids, gridTarget)
  }
  const members = removed.sections.find((entry) => entry.id === section.id)?.items ?? []
  const index = anchor ? Math.max(0, members.indexOf(anchor.id) + (target.after ? 1 : 0)) : members.length
  const nextMembers = [...members.slice(0, index), ...ids, ...members.slice(index)]
  const assigned = { ...removed, sections: removed.sections.map((entry) => (entry.id === section.id ? { ...entry, items: nextMembers } : entry)) }
  return translate(assigned, ids, appendPoint(assigned, shapes, ids[0] as string, section.id))
}

function pointTarget(board: Board, shapes: BoardShapes, ids: readonly string[], point: Point): Board {
  const moved = translate(unsection(board, shapes, ids), ids, point)
  const assigned = assignMembership(moved, shapes, ids, point, board.sections)
  const section = [...assigned.sections].reverse().find((entry) => entry.items.some((id) => ids.includes(id)))
  if (!section || section.layout === 'manual') return assigned
  const drop = gridDropTarget(board, shapes, section.id, point)
  return drop ? insertIntoGrid(moved, shapes, section.id, ids, drop) : assigned
}

type PhysicalSide = 'left' | 'right' | 'above' | 'below'
const PHYSICAL_SIDE: Record<Board['direction'], Record<Extract<BoardTarget, { side: unknown }>['side'], PhysicalSide>> = {
  ltr: { start: 'left', end: 'right', above: 'above', below: 'below' },
  rtl: { start: 'right', end: 'left', above: 'above', below: 'below' },
}

export interface BoardTargetPlacement {
  board: Board
  nudges: Array<{ kind: 'item' | 'label' | 'section'; id: string }>
  usedEstimatedLabels: string[]
}

function subjectEntityIds(board: Board, subject: BoardPlacementSubject): ReadonlySet<string> {
  if (subject.kind === 'items') return new Set(subject.ids)
  if (subject.kind === 'label') return new Set([subject.id])
  const section = board.sections.find((entry) => entry.id === subject.id)
  return new Set([subject.id, ...(section?.items ?? [])])
}

function subjectBoxes(board: Board, shapes: BoardShapes, subject: BoardPlacementSubject): Box[] {
  return subject.kind === 'items' ? subject.ids.map((id) => itemBox(board, shapes, id)) : [subjectBox(board, shapes, subject)]
}

function collisionEntities(board: Board, shapes: BoardShapes, subject: BoardPlacementSubject, reference: ReturnType<typeof resolveEntity>) {
  const ids = subjectEntityIds(board, subject)
  return [
    ...board.items.flatMap((item) =>
      ids.has(item.id) || (reference.kind === 'item' && reference.value.id === item.id)
        ? []
        : [{ kind: 'item' as const, id: item.id, box: itemBox(board, shapes, item.id) }],
    ),
    ...board.labels.flatMap((label) =>
      ids.has(label.id) || (reference.kind === 'label' && reference.value.id === label.id)
        ? []
        : [{ kind: 'label' as const, id: label.id, box: resolvedEntityBox(board, shapes, { kind: 'label', value: label }) }],
    ),
    ...board.sections.flatMap((section) =>
      ids.has(section.id) || (reference.kind === 'section' && reference.value.id === section.id)
        ? []
        : [{ kind: 'section' as const, id: section.id, box: section.rectangle }],
    ),
  ]
}

function clearBeside(
  board: Board,
  shapes: BoardShapes,
  subject: BoardPlacementSubject,
  reference: ReturnType<typeof resolveEntity>,
  side: PhysicalSide,
): { board: Board; nudges: BoardTargetPlacement['nudges'] } {
  const entities = collisionEntities(board, shapes, subject, reference)
  const nudges: BoardTargetPlacement['nudges'] = []
  let next = board
  for (let step = 0; step < entities.length; step += 1) {
    const collision = entities.find((entity) => subjectBoxes(next, shapes, subject).some((box) => overlaps(box, entity.box)))
    if (!collision) break
    const delta =
      side === 'left'
        ? { x: -collision.box.width - SECTION_GAP, y: 0 }
        : side === 'right'
          ? { x: collision.box.width + SECTION_GAP, y: 0 }
          : side === 'above'
            ? { x: 0, y: -collision.box.height - SECTION_GAP }
            : { x: 0, y: collision.box.height + SECTION_GAP }
    const box = subjectBox(next, shapes, subject)
    next = moveSubjectTo(next, shapes, subject, { x: box.x + delta.x, y: box.y + delta.y })
    nudges.push({ kind: collision.kind, id: collision.id })
  }
  return { board: next, nudges }
}

function freePoint(board: Board, shapes: BoardShapes, subject: BoardPlacementSubject): Point {
  const box = subjectBox(board, shapes, subject)
  if (board.items.length + board.labels.length + board.sections.length <= 1) return { x: 0, y: 0 }
  const bounds = boardBounds(board, shapes)
  return { x: board.direction === 'rtl' ? bounds.x - SECTION_GAP - box.width : bounds.x + bounds.width + SECTION_GAP, y: bounds.y }
}

export function placeBoardEntityTarget(board: Board, shapes: BoardShapes, subject: BoardPlacementSubject, target: PlacementTarget): BoardTargetPlacement {
  if ('at' in target) return { board: moveSubjectTo(board, shapes, subject, target.at), nudges: [], usedEstimatedLabels: [] }
  if ('free' in target) return { board: moveSubjectTo(board, shapes, subject, freePoint(board, shapes, subject)), nudges: [], usedEstimatedLabels: [] }
  const reference = resolveEntity(board, target.beside)
  const beside = resolvedEntityBox(board, shapes, reference)
  const moving = subjectBox(board, shapes, subject)
  const side = PHYSICAL_SIDE[board.direction][target.side]
  const startX = board.direction === 'rtl' ? beside.x + beside.width - moving.width : beside.x
  const point =
    side === 'left'
      ? { x: beside.x - SECTION_GAP - moving.width, y: beside.y }
      : side === 'right'
        ? { x: beside.x + beside.width + SECTION_GAP, y: beside.y }
        : side === 'above'
          ? { x: startX, y: beside.y - SECTION_GAP - moving.height }
          : { x: startX, y: beside.y + beside.height + SECTION_GAP }
  const placed = moveSubjectTo(board, shapes, subject, point)
  const cleared = clearBeside(placed, shapes, subject, reference, side)
  return {
    board: cleared.board,
    nudges: cleared.nudges,
    usedEstimatedLabels: reference.kind === 'label' ? [reference.value.id] : [],
  }
}

export function placeBoardTarget(board: Board, shapes: BoardShapes, ids: readonly string[], target: BoardTarget): BoardTargetPlacement {
  if ('section' in target) return { board: sectionTarget(board, shapes, ids, target), nudges: [], usedEstimatedLabels: [] }
  if ('at' in target) return { board: pointTarget(board, shapes, ids, target.at), nudges: [], usedEstimatedLabels: [] }
  if ('free' in target)
    return { board: translate(unsection(board, shapes, ids), ids, appendPoint(board, shapes, ids[0] as string)), nudges: [], usedEstimatedLabels: [] }
  return placeBoardEntityTarget(unsection(board, shapes, ids), shapes, { kind: 'items', ids }, target)
}

export function applyBoardTarget(board: Board, shapes: BoardShapes, ids: readonly string[], target: BoardTarget): Board {
  return placeBoardTarget(board, shapes, ids, target).board
}
