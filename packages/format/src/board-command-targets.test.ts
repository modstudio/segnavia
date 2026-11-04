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
})
