import { type Board, boardFromDocument, type Document, type DocumentInput, documentFromBoard } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'
import { BoardResolutions } from './board-resolutions.ts'
import { boardEvent } from './board-events.ts'
import { BoardSelectionElement } from './board-selection-element.ts'
import type { BrandsOptions } from './brands.ts'

export abstract class BoardDocumentElement extends BoardSelectionElement {
  protected readonly resolutions = new BoardResolutions((error) => this.dispatchEvent(boardEvent('segnavia-board-error', { error })))
  private documentValue: Document | null = null
  private brandOptions: BrandsOptions | undefined
  protected get boardDocument(): Document | null {
    return this.documentValue
  }
  get brands(): BrandsOptions | undefined {
    return this.brandOptions
  }
  set brands(value: BrandsOptions | undefined) {
    this.brandOptions = value
    if (this.documentValue) this.acceptBoardInput(boardFromDocument(this.documentValue))
  }

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
