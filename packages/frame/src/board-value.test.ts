import { expect, test } from 'bun:test'
import { Board } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import { boardValue } from './board-value.ts'

test('reads the internal board value across separately built bundles', () => {
  const board = Board.parse({ title: 'Board', direction: 'ltr', items: [], labels: [], sections: [] })
  const element = {
    [Symbol.for('@segnavia/frame/internal-board-value')]: () => board,
  }

  expect(boardValue(element as unknown as SegnaviaBoard)).toBe(board)
})
