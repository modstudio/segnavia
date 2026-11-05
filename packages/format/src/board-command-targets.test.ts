import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { applyBoardTarget } from './board-command-targets.ts'
import type { BoardShapes } from './board-geometry.ts'

const shapes: BoardShapes = { items: { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } }, labels: { l: { width: 30, height: 10 } } }
const value = (direction: Board['direction']): Board => ({
  title: 'B',
  direction,
  items: [
    { id: 'a', kind: 'page', address: 'a', x: 0, y: 0, width: 100 },
    { id: 'b', kind: 'page', address: 'b', x: 200, y: 0, width: 100 },
  ],
  labels: [{ id: 'l', text: 'L', x: 400, y: 0 }],
  sections: [{ id: 's', title: 'S', rectangle: { x: 0, y: 200, width: 400, height: 200 }, items: [], layout: 'manual' }],
})

describe('applyBoardTarget', () => {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`places section, point, free and logical beside targets in ${direction}`, () => {
      const board = value(direction)
      expect(applyBoardTarget(board, shapes, ['a'], { section: { id: 's' } }).sections[0]?.items).toEqual(['a'])
      expect(applyBoardTarget(board, shapes, ['a'], { at: { x: 20, y: 30 } }).items[0]).toMatchObject({ x: 20, y: 30 })
      const free = applyBoardTarget(board, shapes, ['a'], { free: true }).items[0]
      expect(direction === 'ltr' ? (free?.x ?? 0) > 400 : (free?.x ?? 0) < 0).toBe(true)
      const beside = applyBoardTarget(board, shapes, ['a'], { beside: { id: 'b' }, side: 'start' }).items[0]
      expect(direction === 'ltr' ? (beside?.x ?? 0) < 200 : (beside?.x ?? 0) > 200).toBe(true)
    })
  }

  test('aligns an above target to the logical start edge in rtl', () => {
    const board = value('rtl')
    const moved = applyBoardTarget(board, shapes, ['a'], { beside: { id: 'l' }, side: 'above' }).items[0]
    expect(moved).toMatchObject({ x: 330 })
  })

  test('uses membership assignment for a point drop and preserves its top-left', () => {
    const board = value('ltr')
    const moved = applyBoardTarget(board, shapes, ['a'], { at: { x: 20, y: 230 } })
    expect(moved.items[0]).toMatchObject({ x: 20, y: 230 })
    expect(moved.sections[0]?.items).toEqual(['a'])
  })

  test('keeps group offsets when placing items beside a reference', () => {
    const board = value('ltr')
    const beforeA = board.items.find((item) => item.id === 'a')
    const beforeB = board.items.find((item) => item.id === 'b')
    const moved = applyBoardTarget(board, shapes, ['a', 'b'], { beside: { id: 'l' }, side: 'below' })
    const afterA = moved.items.find((item) => item.id === 'a')
    const afterB = moved.items.find((item) => item.id === 'b')
    expect({ x: (afterB?.x ?? 0) - (afterA?.x ?? 0), y: (afterB?.y ?? 0) - (afterA?.y ?? 0) }).toEqual({
      x: (beforeB?.x ?? 0) - (beforeA?.x ?? 0),
      y: (beforeB?.y ?? 0) - (beforeA?.y ?? 0),
    })
  })

  test('places ordered and point targets into an auto-layout grid', () => {
    const board = value('ltr')
    const section = board.sections[0]
    const first = board.items[0]
    if (!section || !first) throw new Error('test board has no section or first item')
    board.sections[0] = { ...section, layout: 'auto', items: ['a'], cells: [{ id: 'a', row: 0, column: 0 }] }
    board.items[0] = { ...first, x: 24, y: 264 }

    const ordered = applyBoardTarget(board, shapes, ['b'], { section: { id: 's' }, after: { id: 'a' } })
    expect(ordered.sections[0]?.cells).toEqual([
      { id: 'a', row: 0, column: 0 },
      { id: 'b', row: 0, column: 1 },
    ])

    const dropped = applyBoardTarget(board, shapes, ['b'], { at: { x: 120, y: 280 } })
    expect(dropped.sections[0]?.items).toEqual(['a', 'b'])
    expect(dropped.sections[0]?.cells?.map((cell) => cell.id)).toEqual(['a', 'b'])
  })
})
