import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import type { BoardCommand } from './board-commands.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'
import { editBoard } from './edit-board.ts'

const shapes: ComputedBoardShapes = {
  shapes: { items: { a: { width: 2, height: 1 }, b: { width: 2, height: 1 }, c: { width: 2, height: 1 } }, labels: {} },
  provisional: [],
  estimated: [],
}

function fixture(direction: Board['direction'] = 'ltr'): Board {
  return {
    title: 'Board',
    direction,
    items: [
      { id: 'a', kind: 'page', address: 'a', x: 20, y: 50, width: 80 },
      { id: 'b', kind: 'page', address: 'b', x: 130, y: 50, width: 80 },
      { id: 'c', kind: 'page', address: 'c', x: 500, y: 50, width: 80 },
    ],
    labels: [],
    sections: [
      {
        id: 'auto',
        title: 'Auto',
        rectangle: { x: 0, y: 0, width: 240, height: 160 },
        items: ['a', 'b'],
        layout: 'auto',
        cells: [
          { id: 'a', row: 0, column: 0 },
          { id: 'b', row: 0, column: 1 },
        ],
      },
      { id: 'manual', title: 'Manual', rectangle: { x: 450, y: 0, width: 180, height: 160 }, items: ['c'], layout: 'manual' },
    ],
  }
}

describe('board property commands', () => {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`sets board title and direction from ${direction}`, () => {
      const before = fixture(direction)
      const nextDirection = direction === 'ltr' ? 'rtl' : 'ltr'
      const result = editBoard(before, [{ type: 'board-set', title: 'Renamed', direction: nextDirection }], shapes)
      if (!result.ok) throw new Error(result.refusal)
      expect(result.board).toMatchObject({ title: 'Renamed', direction: nextDirection })
      const a = result.board.items.find((item) => item.id === 'a')
      const b = result.board.items.find((item) => item.id === 'b')
      expect((a?.x ?? 0) < (b?.x ?? 0)).toBe(nextDirection === 'ltr')
      expect(result.board.items.find((item) => item.id === 'c')).toEqual(before.items.find((item) => item.id === 'c'))
      expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'auto-layout', id: 'auto', detail: expect.stringContaining(nextDirection) }))
    })
  }

  test('does nothing geometric when setting current values', () => {
    const before = fixture()
    const result = editBoard(before, [{ type: 'board-set', title: 'Board', direction: 'ltr' }], shapes)
    if (!result.ok) throw new Error(result.refusal)
    expect(result.board).toEqual(before)
    expect(result.adjustments).toEqual([])
  })

  test('refuses an empty command and a missing auto-section shape', () => {
    const empty = editBoard(fixture(), [{ type: 'board-set' }] as BoardCommand[], shapes)
    expect(empty.ok ? '' : empty.refusal).toMatch(
      /board-set requires at least one of title or direction.*pass a command matching BoardCommand.*Nothing was changed/,
    )
    const incomplete = structuredClone(shapes)
    delete incomplete.shapes.items.a
    const missing = editBoard(fixture(), [{ type: 'board-set', direction: 'rtl' }], incomplete)
    expect(missing.ok ? '' : missing.refusal).toMatch(/item "a" has no resolved shape.*pass the resolved shape.*Nothing was changed/)
  })
})
