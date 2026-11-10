import { describe, expect, test } from 'bun:test'
import type { BoardItem, BoardLabel, BoardSection } from '@segnavia/format'
import { reconcileBoardSelection, selectBoardNode } from './board-selection.ts'

const items = [{ id: 'one' }, { id: 'two' }] as BoardItem[]
const labels = [{ id: 'label', text: 'Label', x: 0, y: 0 }] as BoardLabel[]
const sections = [{ id: 'section' }] as BoardSection[]

describe('reconcileBoardSelection', () => {
  test('keeps existing ids once and preserves selection order', () => {
    expect(reconcileBoardSelection(['two', 'section', 'gone', 'label', 'one', 'two'], [...items, ...labels, ...sections])).toEqual([
      'two',
      'section',
      'label',
      'one',
    ])
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
