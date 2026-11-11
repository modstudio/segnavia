import { describe, expect, test } from 'bun:test'
import type { Board, BoardShapes } from '@segnavia/format'
import { adjacentBoardFocusStop, type BoardFocusFacts, focusBoardByTab } from './board-focus.ts'

function facts(overrides: Partial<BoardFocusFacts> = {}): BoardFocusFacts {
  return {
    order: ['one', 'two', 'three'],
    actionCounts: {},
    available: new Set(['one', 'three']),
    needsReveal: new Set(),
    ...overrides,
  }
}

describe('adjacentBoardFocusStop', () => {
  test('reveals an unmounted entity and skips one that cannot be revealed', () => {
    expect(adjacentBoardFocusStop(facts({ needsReveal: new Set(['two']) }), { id: 'one' }, false)).toEqual({ kind: 'stop', stop: { id: 'two' } })
    expect(adjacentBoardFocusStop(facts(), { id: 'one' }, false)).toEqual({ kind: 'stop', stop: { id: 'three' } })
  })

  test('places mounted item actions after their entity in button order', () => {
    const withActions = facts({ actionCounts: { one: 2 } })
    expect(adjacentBoardFocusStop(withActions, { id: 'one' }, false)).toEqual({ kind: 'stop', stop: { id: 'one', action: 0 } })
    expect(adjacentBoardFocusStop(withActions, { id: 'one', action: 0 }, false)).toEqual({ kind: 'stop', stop: { id: 'one', action: 1 } })
    expect(adjacentBoardFocusStop(withActions, { id: 'one', action: 1 }, false)).toEqual({ kind: 'stop', stop: { id: 'three' } })
    expect(adjacentBoardFocusStop(withActions, { id: 'three' }, true)).toEqual({ kind: 'stop', stop: { id: 'one', action: 1 } })
  })

  test('enters from the host only going forward', () => {
    expect(adjacentBoardFocusStop(facts(), undefined, false)).toEqual({ kind: 'stop', stop: { id: 'one' } })
    expect(adjacentBoardFocusStop(facts(), undefined, true)).toBeUndefined()
  })

  test('exits at either end of the modeled order', () => {
    expect(adjacentBoardFocusStop(facts(), { id: 'one' }, true)).toEqual({ kind: 'exit' })
    expect(adjacentBoardFocusStop(facts(), { id: 'three' }, false)).toEqual({ kind: 'exit' })
  })
})

test('adapter exits after a loose label even while an item is mounted', () => {
  const board: Board = {
    title: 'Board',
    direction: 'ltr',
    items: [{ id: 'item', kind: 'page', address: 'item', x: 0, y: 0, width: 100 }],
    labels: [{ id: 'label', text: 'Loose', x: 200, y: 0 }],
    sections: [],
  }
  const shapes: BoardShapes = { items: { item: { width: 1, height: 1 } }, labels: { label: { width: 20, height: 10 } } }
  const exits: boolean[] = []
  const nodes = new Map([
    ['item', { focus() {} }],
    ['label', { focus() {} }],
  ])
  expect(
    focusBoardByTab(
      board,
      shapes,
      true,
      { id: 'label' },
      false,
      (id) => nodes.get(id),
      () => [],
      () => false,
      (backwards) => exits.push(backwards),
    ),
  ).toBe(true)
  expect(exits).toEqual([false])
})
