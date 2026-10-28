import { describe, expect, test } from 'bun:test'
import { galleyInlineOffset, intersectsScaledExtent, type SequentialWindow, sequentialPairs } from './paginated-ink-windows.ts'

function window(overrides: Partial<SequentialWindow> = {}): SequentialWindow {
  return { flow: 'chapter', column: 0, columns: 1, start: 0, end: 100, ...overrides }
}

describe('sequentialPairs', () => {
  test('does not pair a full-width window with the start of a two-column run', () => {
    const windows = [window(), window({ columns: 2, start: 100, end: 200 })]

    expect(sequentialPairs(windows)).toEqual([])
  })

  test('pairs adjacent windows in the same column run geometry', () => {
    const windows = [window({ columns: 2, run: 4 }), window({ columns: 2, run: 4, start: 100, end: 200 })]

    expect(sequentialPairs(windows)).toEqual([
      { previous: windows[0] as SequentialWindow, next: windows[1] as SequentialWindow, previousIndex: 0, nextIndex: 1 },
    ])
  })

  test('does not pair equal-geometry column runs separated by a full-width window', () => {
    const windows = [window({ columns: 2, run: 4 }), window({ start: 100, end: 120 }), window({ columns: 2, run: 6, start: 120, end: 220 })]

    expect(sequentialPairs(windows)).toEqual([])
  })
})

describe('galleyInlineOffset', () => {
  test('uses the run origin for columns and the flow origin for full-width windows', () => {
    expect(galleyInlineOffset(2, 10, 242)).toBe(232)
    expect(galleyInlineOffset(1, 10, 388)).toBe(0)
  })
})

describe('intersectsScaledExtent', () => {
  test('only skips a band that overlaps a scaled replaced element', () => {
    const scaled = [{ start: 20, end: 80 }]

    expect(intersectsScaledExtent({ start: 0, end: 8 }, scaled)).toBe(false)
    expect(intersectsScaledExtent({ start: 16, end: 24 }, scaled)).toBe(true)
    expect(intersectsScaledExtent({ start: 80, end: 88 }, scaled)).toBe(false)
  })
})
