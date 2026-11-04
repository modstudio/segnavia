import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { changedEntities } from './board-edit-result.ts'

const before: Board = {
  title: 'B',
  direction: 'ltr',
  items: [{ id: 'a', kind: 'page', address: 'a', x: 0, y: 0, width: 100 }],
  labels: [],
  sections: [],
}
const shapes = { items: { a: { width: 100, height: 50 } }, labels: {} }

describe('changedEntities', () => {
  test('keeps boxes only at full detail', () => {
    const first = before.items[0]
    if (!first) throw new Error('test board has no item')
    const after = { ...before, items: [{ ...first, x: 10 }] }
    expect(changedEntities(before, after, shapes, 'concise')).toEqual([{ kind: 'item', id: 'a' }])
    expect(changedEntities(before, after, shapes, 'full')[0]?.box).toEqual({ x: 10, y: 0, width: 100, height: 50 })
  })
})
