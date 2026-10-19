import { type Board, type BoardShapes, fitSection, settleBoard } from '@segnavia/format'

function affectedSections(before: Board, after: Board, ids: readonly string[]): string[] {
  const touched = new Set(ids)
  return [...before.sections, ...after.sections]
    .filter((section) => touched.has(section.id) || section.items.some((id) => touched.has(id)))
    .map((section) => section.id)
    .filter((id, index, all) => all.indexOf(id) === index)
}

export function fitTouchedSections(board: Board, shapes: BoardShapes, ids: readonly string[]): Board {
  return affectedSections(board, board, ids).reduce((value, id) => fitSection(value, shapes, id), board)
}

export function settleTouched(before: Board, after: Board, shapes: BoardShapes, ids: readonly string[]): Board {
  return settleBoard(after, shapes, [...ids, ...affectedSections(before, after, ids)])
}
