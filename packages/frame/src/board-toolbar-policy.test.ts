import { describe, expect, test } from 'bun:test'
import { toolbarNextIndex } from './board-toolbar-policy.ts'

describe('board toolbar navigation', () => {
  const enabled = [true, false, true, true]

  test('moves through enabled buttons and wraps in left-to-right direction', () => {
    expect(toolbarNextIndex(enabled, 0, 'ArrowRight', false)).toBe(2)
    expect(toolbarNextIndex(enabled, 0, 'ArrowLeft', false)).toBe(3)
    expect(toolbarNextIndex(enabled, 3, 'ArrowRight', false)).toBe(0)
  })

  test('reverses arrow movement in right-to-left direction', () => {
    expect(toolbarNextIndex(enabled, 0, 'ArrowLeft', true)).toBe(2)
    expect(toolbarNextIndex(enabled, 0, 'ArrowRight', true)).toBe(3)
  })

  test('moves to the ends and handles no enabled buttons', () => {
    expect(toolbarNextIndex(enabled, 2, 'Home', false)).toBe(0)
    expect(toolbarNextIndex(enabled, 2, 'End', false)).toBe(3)
    expect(toolbarNextIndex([false, false], 0, 'Home', false)).toBe(-1)
  })
})
