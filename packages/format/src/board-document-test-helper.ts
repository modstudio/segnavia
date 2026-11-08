import type { Board } from './board.ts'
import { Document, type Document as DocumentValue } from './document.ts'

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
