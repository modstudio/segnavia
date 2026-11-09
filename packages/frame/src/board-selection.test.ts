import { describe, expect, test } from 'bun:test'
import type { BoardItem, BoardLabel } from '@segnavia/format'
import { reconcileBoardSelection, selectBoardNode } from './board-selection.ts'

const items = [{ id: 'one' }, { id: 'two' }] as BoardItem[]
const labels = [{ id: 'label', text: 'Label', x: 0, y: 0 }] as BoardLabel[]

describe('reconcileBoardSelection', () => {
  test('keeps existing ids once and returns them in board order', () => {
    expect(reconcileBoardSelection(['two', 'gone', 'label', 'one', 'two'], [...items, ...labels])).toEqual(['one', 'two', 'label'])
    expect(reconcileBoardSelection([], items)).toEqual([])
  })
})

describe('selectBoardNode', () => {
  test('replaces, adds, and removes a mixed node selection', () => {
    expect(selectBoardNode(['one'], 'two', false)).toEqual(['two'])
    expect(selectBoardNode(['one'], 'label', true)).toEqual(['one', 'label'])
    expect(selectBoardNode(['one', 'label'], 'one', true)).toEqual(['label'])
  })
})
