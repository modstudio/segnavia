import { describe, expect, test } from 'bun:test'
import type { Board } from '@segnavia/format'
import { fitTouchedSections } from './board-edit-settlement.ts'

const shapes = { items: { one: { width: 100, height: 50 }, two: { width: 100, height: 100 } }, labels: {} }
const before: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [
    { id: 'one', kind: 'deck', address: 'one', x: 0, y: 0, width: 100 },
    { id: 'two', kind: 'page', address: 'two', x: 200, y: 0, width: 100 },
  ],
  labels: [],
  sections: [{ id: 'section', title: 'Section', rectangle: { x: -24, y: -56, width: 348, height: 180 }, items: ['one', 'two'] }],
}

describe('board edit settlement', () => {
  test('fits a touched member for a live edit without making room', () => {
    const moved = { ...before, items: before.items.map((item) => (item.id === 'one' ? { ...item, x: -50 } : item)) }
    const fitted = fitTouchedSections(moved, shapes, ['one'])
    expect(fitted.sections[0]?.rectangle.x).toBe(-74)
    expect(fitted.items[1]?.x).toBe(200)
  })
})
