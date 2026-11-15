import { expect, test } from 'bun:test'
import { Board, boardFromDocument, Document, type DocumentInput } from '@segnavia/format'

const input = {
  type: 'document',
  id: 'board-document',
  kind: 'board',
  title: 'Board',
  settings: { dir: 'ltr' },
  children: [{ type: 'item', id: 'one', kind: 'page', address: 'one', x: 0, y: 0, width: 100 }],
} satisfies DocumentInput

const editionInput = (title: string) =>
  ({
    ...input,
    title,
    conditions: [{ type: 'condition' as const, name: 'teacher' }],
    editions: [
      { type: 'edition' as const, name: 'student', conditions: [] },
      { type: 'edition' as const, name: 'teacher', conditions: ['teacher'] },
    ],
    defaultEdition: 'student',
  }) satisfies DocumentInput

test('board Document input, change detail and editing bridge stay in the host shape', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class extends EventTarget {} })
  try {
    const { BoardDocumentElement } = await import('./board-document-element.ts')
    class BoardElementStub extends BoardDocumentElement {
      selection: readonly string[] = []
      value: Board | null = null
      repaints = 0
      protected acceptBoardInput(board: Board | null): void {
        this.value = board
        this.dispatchEvent(new CustomEvent('segnavia-board-change', { detail: { board: this.board } }))
      }
      document(board: Board) {
        return this.documentWithBoard(board)
      }
      optimistic(board: Board) {
        this.value = this.holdBoardEdit(board)
      }
      protected brandsChanged() {
        this.repaints++
      }
    }
    const element = new BoardElementStub()
    let changed: unknown
    element.addEventListener('segnavia-board-change', (event) => {
      changed = (event as CustomEvent).detail.board
    })
    element.board = input
    const parsed = Document.parse(input)
    expect(element.board).toEqual(parsed)
    expect(changed).toEqual(parsed)
    expect(element.value).toEqual(boardFromDocument(element.board as NonNullable<typeof element.board>))

    changed = undefined
    element.brands = { source: { brand: async () => undefined } }
    expect(changed).toBeUndefined()
    expect(element.repaints).toBe(1)

    const edited = Board.parse({ ...(element.value as Board), items: [{ ...(element.value as Board).items[0], x: 20 }] })
    const callback = (board: Board) => element.document(board)
    expect(boardFromDocument(callback(edited))).toEqual(edited)
    element.optimistic(edited)
    expect(boardFromDocument(element.board as NonNullable<typeof element.board>)).toEqual(edited)

    Object.defineProperty(element, 'edition', { configurable: true, writable: true, value: 'student' })
    element.board = editionInput('Original')
    const editionDocument = Reflect.get(element, 'editionDocument')
    const documentValue = element.board
    element.edition = 'missing'
    expect(() => (element.board = editionInput('Replacement'))).toThrow('requested edition "missing" is unknown')
    expect(Reflect.get(element, 'editionDocument')).toBe(editionDocument)
    expect(element.board).toBe(documentValue)
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
