import { describe, expect, test } from 'bun:test'
import { galleyInlineOffset, type SequentialWindow, sequentialPairs } from './paginated-ink-windows.ts'

function window(overrides: Partial<SequentialWindow> = {}): SequentialWindow {
  return { flow: 'chapter', column: 0, columns: 1, start: 0, end: 100, ...overrides }
}

describe('sequentialPairs', () => {
  test('does not pair a full-width window with the start of a two-column run', () => {
    const windows = [window(), window({ columns: 2, start: 100, end: 200 })]

    expect(sequentialPairs(windows)).toEqual([])
  })

  test('pairs adjacent windows in the same column run geometry', () => {
    const windows = [window({ columns: 2 }), window({ columns: 2, start: 100, end: 200 })]

    expect(sequentialPairs(windows)).toEqual([
      { previous: windows[0] as SequentialWindow, next: windows[1] as SequentialWindow, previousIndex: 0, nextIndex: 1 },
    ])
  })
})

describe('galleyInlineOffset', () => {
  test('uses the run origin for columns and the flow origin for full-width windows', () => {
    expect(galleyInlineOffset(2, 10, 242)).toBe(232)
    expect(galleyInlineOffset(1, 10, 388)).toBe(0)
  })
})
