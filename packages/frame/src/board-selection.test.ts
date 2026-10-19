import { describe, expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import { reconcileBoardSelection } from './board-selection.ts'

const items = [{ id: 'one' }, { id: 'two' }] as BoardItem[]

describe('reconcileBoardSelection', () => {
  test('keeps an item id and clears an id absent from the board', () => {
    expect(reconcileBoardSelection('one', items)).toBe('one')
    expect(reconcileBoardSelection('gone', items)).toBeNull()
    expect(reconcileBoardSelection(null, items)).toBeNull()
  })
})
