import { describe, expect, test } from 'bun:test'
import type { BoardItem, BoardLabel, BoardSection } from '@segnavia/format'
import { BoardSelection, type BoardSelectionDetail, reconcileBoardSelection, selectBoardNode } from './board-selection.ts'

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

test('dispatches tagged entries in selection order without the replaced node fields', () => {
  let detail: BoardSelectionDetail | undefined
  const host = {
    dispatchEvent(event: CustomEvent<BoardSelectionDetail>) {
      detail = event.detail
      return true
    },
  }
  const selection = new BoardSelection(
    host as unknown as HTMLElement,
    () => new Map(items.map((item) => [item.id, item])),
    () => new Map(labels.map((label) => [label.id, label])),
    () => new Map(sections.map((section) => [section.id, section])),
    () => new Map(),
    () => {},
  )
  selection.selection = ['one', 'label', 'section']
  expect(detail?.entries.map((entry) => entry.kind)).toEqual(['item', 'label', 'section'])
  expect(Object.hasOwn(detail as object, 'nodes')).toBe(false)
  expect(Object.hasOwn(detail as object, 'node')).toBe(false)
})
