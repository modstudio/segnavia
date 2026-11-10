import { describe, expect, test } from 'bun:test'
import { adjacentBoardFocusStop, type BoardFocusFacts } from './board-focus.ts'

function facts(overrides: Partial<BoardFocusFacts> = {}): BoardFocusFacts {
  return {
    order: ['one', 'two', 'three'],
    actionCounts: {},
    available: new Set(['one', 'three']),
    revealable: new Set(),
    ...overrides,
  }
}

describe('adjacentBoardFocusStop', () => {
  test('reveals an unmounted entity and skips one that cannot be revealed', () => {
    expect(adjacentBoardFocusStop(facts({ revealable: new Set(['two']) }), { id: 'one' }, false)).toEqual({ id: 'two' })
    expect(adjacentBoardFocusStop(facts(), { id: 'one' }, false)).toEqual({ id: 'three' })
  })

  test('places mounted item actions after their entity in button order', () => {
    const withActions = facts({ actionCounts: { one: 2 } })
    expect(adjacentBoardFocusStop(withActions, { id: 'one' }, false)).toEqual({ id: 'one', action: 0 })
    expect(adjacentBoardFocusStop(withActions, { id: 'one', action: 0 }, false)).toEqual({ id: 'one', action: 1 })
    expect(adjacentBoardFocusStop(withActions, { id: 'one', action: 1 }, false)).toEqual({ id: 'three' })
    expect(adjacentBoardFocusStop(withActions, { id: 'three' }, true)).toEqual({ id: 'one', action: 1 })
  })

  test('enters from the host only going forward', () => {
    expect(adjacentBoardFocusStop(facts(), undefined, false)).toEqual({ id: 'one' })
    expect(adjacentBoardFocusStop(facts(), undefined, true)).toBeUndefined()
  })
})
