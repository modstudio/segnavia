import { type Board, type BoardShapes, fitSection, touchedSections } from '@segnavia/format'

export function fitTouchedSections(board: Board, shapes: BoardShapes, ids: readonly string[]): Board {
  return touchedSections(board, board, ids).reduce((value, id) => fitSection(value, shapes, id), board)
}
