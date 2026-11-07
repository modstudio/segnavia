import { type Board, boardFromDocument, Document, type DocumentInput, documentFromBoard } from '@segnavia/format'
import { BoardSelectionElement } from './board-selection-element.ts'

export abstract class BoardDocumentElement extends BoardSelectionElement {
  private documentValue: Document | null = null

  get board(): Document | null {
    return this.documentValue
  }

  set board(input: DocumentInput | null) {
    const document = input === null ? null : Document.parse(input)
    this.documentValue = document
    this.acceptBoardInput(document === null ? null : boardFromDocument(document))
  }

  protected documentWithBoard(board: Board): Document {
    if (!this.documentValue) throw new Error('a board Document is required before editing; set board to a board Document to clear this refusal')
    return documentFromBoard(board, this.documentValue)
  }

  protected abstract acceptBoardInput(board: Board | null): void
}
