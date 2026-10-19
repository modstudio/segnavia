import { describe, expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import { reconcileBoardSelection } from './board-selection.ts'

const items = [{ id: 'one' }, { id: 'two' }] as BoardItem[]

describe('reconcileBoardSelection', () => {
  test('keeps existing ids once and returns them in board order', () => {
    expect(reconcileBoardSelection(['two', 'gone', 'one', 'two'], items)).toEqual(['one', 'two'])
    expect(reconcileBoardSelection([], items)).toEqual([])
  })
})
