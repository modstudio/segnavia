import type { Board } from './board.ts'
import type { BoardCommandOptions } from './board-command-core.ts'
import type { BoardCommand } from './board-commands.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'
import { Document, type Document as DocumentValue } from './document.ts'
import { editBoard } from './edit-board.ts'

export function documentForBoard(board: Board): DocumentValue {
  return Document.parse({
    type: 'document',
    id: 'test-board',
    kind: 'board',
    title: board.title,
    settings: { dir: board.direction },
    children: [
      ...board.items.map((item) => ({ type: 'item' as const, ...item })),
      ...board.labels.map((label) => ({ type: 'label' as const, ...label })),
      ...board.sections.map((section) => ({ type: 'boardSection' as const, ...section })),
    ],
  })
}

export function editBoardForBoard(board: Board, commands: BoardCommand[], shapes: ComputedBoardShapes, options?: BoardCommandOptions) {
  return editBoard(documentForBoard(board), commands, shapes, options)
}
