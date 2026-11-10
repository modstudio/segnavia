import { type BoardCommand, type BoardEditResult, type BoardShapes, type Document, editBoard } from '@segnavia/format'

export function editBoardFromFrame(document: Document, commands: BoardCommand[], shapes: BoardShapes): BoardEditResult {
  return editBoard(document, commands, { shapes, provisional: [], estimated: [] })
}
