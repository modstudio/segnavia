import type { Board } from './board.ts'
import { BoardCommandRefusal, resolveEntity, resolveItem, resolveSection } from './board-command-resolvers.ts'
import type { BoardTarget } from './board-commands.ts'
import { type BoardShapes, boardBounds, itemHeight } from './board-geometry.ts'
import { gridDropTarget, insertIntoGrid, removeFromGrid } from './board-section-grid.ts'
import { SECTION_GAP, SECTION_PADDING, SECTION_TITLE_ROOM } from './board-sections.ts'
import type { Box, Point } from './deck.ts'

function itemBox(board: Board, shapes: BoardShapes, id: string): Box {
  const item = board.items.find((entry) => entry.id === id)
  const shape = shapes.items[id]
  if (!item || !shape) throw new BoardCommandRefusal(`item "${id}" has no resolved shape`, `pass the resolved shape for item "${id}"`)
  return { x: item.x, y: item.y, width: item.width, height: itemHeight(item, shape) }
}

function entityBox(board: Board, shapes: BoardShapes, target: ReturnType<typeof resolveEntity>): Box {
  if (target.kind === 'section') return target.value.rectangle
  if (target.kind === 'item') return itemBox(board, shapes, target.value.id)
  const shape = shapes.labels[target.value.id]
  if (!shape) throw new BoardCommandRefusal(`label "${target.value.id}" has no resolved shape`, `pass the resolved shape for label "${target.value.id}"`)
  return { x: target.value.x, y: target.value.y, ...shape }
}

function translate(board: Board, ids: readonly string[], point: Point): Board {
  const first = board.items.find((item) => item.id === ids[0])
  if (!first) return board
  const delta = { x: point.x - first.x, y: point.y - first.y }
  const moved = new Set(ids)
  return {
    ...board,
    items: board.items.map((item) => (moved.has(item.id) ? { ...item, x: item.x + delta.x, y: item.y + delta.y } : item)),
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
  const section = [...board.sections]
    .reverse()
    .find(
      (entry) =>
        point.x >= entry.rectangle.x &&
        point.x <= entry.rectangle.x + entry.rectangle.width &&
        point.y >= entry.rectangle.y &&
        point.y <= entry.rectangle.y + entry.rectangle.height,
    )
  const moved = translate(unsection(board, shapes, ids), ids, point)
  if (!section) return moved
  if (section.layout === 'manual') {
    return { ...moved, sections: moved.sections.map((entry) => (entry.id === section.id ? { ...entry, items: [...entry.items, ...ids] } : entry)) }
  }
  const drop = gridDropTarget(board, shapes, section.id, point)
  return drop ? insertIntoGrid(moved, shapes, section.id, ids, drop) : moved
}

export function applyBoardTarget(board: Board, shapes: BoardShapes, ids: readonly string[], target: BoardTarget): Board {
  if ('section' in target) return sectionTarget(board, shapes, ids, target)
  if ('at' in target) return pointTarget(board, shapes, ids, target.at)
  if ('free' in target) return translate(unsection(board, shapes, ids), ids, appendPoint(board, shapes, ids[0] as string))
  const reference = resolveEntity(board, target.beside)
  const beside = entityBox(board, shapes, reference)
  const first = itemBox(board, shapes, ids[0] as string)
  const side =
    target.side === 'start'
      ? board.direction === 'rtl'
        ? 'right'
        : 'left'
      : target.side === 'end'
        ? board.direction === 'rtl'
          ? 'left'
          : 'right'
        : target.side
  const point =
    side === 'left'
      ? { x: beside.x - SECTION_GAP - first.width, y: beside.y }
      : side === 'right'
        ? { x: beside.x + beside.width + SECTION_GAP, y: beside.y }
        : side === 'above'
          ? { x: beside.x, y: beside.y - SECTION_GAP - first.height }
          : { x: beside.x, y: beside.y + beside.height + SECTION_GAP }
  return translate(unsection(board, shapes, ids), ids, point)
}
