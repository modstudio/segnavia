import { type Board, boardFromDocument, type Document, type DocumentInput, documentFromBoard } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'
import { BoardSelectionElement } from './board-selection-element.ts'

export abstract class BoardDocumentElement extends BoardSelectionElement {
  private documentValue: Document | null = null

  get board(): Document | null {
    return this.documentValue
  }

  set board(input: DocumentInput | null) {
    const document = input === null ? null : parseDocument(input)
    this.documentValue = document
    this.acceptBoardInput(document === null ? null : boardFromDocument(document))
  }

  protected documentWithBoard(board: Board): Document {
    if (!this.documentValue) throw new Error('a board Document is required before editing; set board to a board Document to clear this refusal')
    return documentFromBoard(board, this.documentValue)
  }

  protected holdBoardEdit(board: Board): Board {
    this.documentValue = this.documentWithBoard(board)
    return board
  }

  protected abstract acceptBoardInput(board: Board | null): void
}
