import { expect, test } from 'bun:test'
import { boardFromDocument, Document, documentFromBoard } from '@segnavia/format'
import { BOARD_DOCUMENT_FIXTURES } from './build-board-demo.ts'

test('every embedded board fixture round-trips after canonical child ordering', () => {
  for (const input of BOARD_DOCUMENT_FIXTURES) {
    const document = Document.parse(input)
    const board = boardFromDocument(document)
    expect(documentFromBoard(board, document)).toEqual(document)
    expect(boardFromDocument(documentFromBoard(board, document))).toEqual(board)
  }
})
