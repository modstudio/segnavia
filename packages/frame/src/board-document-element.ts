import { type Board, boardFromDocument, type Document, type DocumentInput, documentFromBoard } from '@segnavia/format'
import { parseDocument, resolveEdition } from '@segnavia/html'
import { boardEvent } from './board-events.ts'
import { BoardResolutions } from './board-resolutions.ts'
import { BoardSelectionElement } from './board-selection-element.ts'
import type { BrandsOptions } from './brands.ts'
import { defineEditionPropertyAccessor } from './edition-property.ts'

export abstract class BoardDocumentElement extends BoardSelectionElement {
  static {
    defineEditionPropertyAccessor(BoardDocumentElement.prototype)
  }
  declare edition: string | undefined
  protected readonly resolutions = new BoardResolutions((error) => this.dispatchEvent(boardEvent('segnavia-board-error', { error })))
  private documentValue: Document | null = null
  private editionDocument: Document | null = null
  private brandOptions: BrandsOptions | undefined
  protected get boardDocument(): Document | null {
    return this.documentValue
  }
  get brands(): BrandsOptions | undefined {
    return this.brandOptions
  }
  set brands(value: BrandsOptions | undefined) {
    this.brandOptions = value
    this.resolutions.configure(this.documentValue, value)
    this.brandsChanged()
  }

  protected brandsChanged(): void {}

  get board(): Document | null {
    return this.documentValue
  }

  set board(input: DocumentInput | null) {
    const editionDocument = input === null ? null : parseDocument(input)
    const document = editionDocument && resolveEdition(editionDocument, this.edition)
    this.editionDocument = editionDocument
    this.acceptEditionDocument(document)
  }

  attributeChangedCallback(name: string): void {
    if (name !== 'edition') return
    try {
      this.applyEditionDocument()
    } catch (error) {
      this.dispatchEvent(boardEvent('segnavia-board-error', { error }))
    }
  }

  private applyEditionDocument(): void {
    const document = this.editionDocument && resolveEdition(this.editionDocument, this.edition)
    this.acceptEditionDocument(document)
  }

  private acceptEditionDocument(document: Document | null): void {
    this.documentValue = document
    this.acceptBoardInput(document === null ? null : boardFromDocument(document))
  }

  protected documentWithBoard(board: Board): Document {
    if (!this.documentValue) throw new Error('a board Document is required before editing; set board to a board Document to clear this refusal')
    return documentFromBoard(board, this.documentValue)
  }

  protected holdBoardEdit(board: Board): Board {
    this.documentValue = this.documentWithBoard(board)
    this.editionDocument = this.documentValue
    return board
  }

  protected abstract acceptBoardInput(board: Board | null): void
}
