import { describe, expect, test } from 'bun:test'
import {
  assignMembership,
  type Board,
  fitSection,
  MAKE_ROOM_LIMIT,
  makeRoom,
  SECTION_MIN_SIZE,
  SECTION_PADDING,
  SECTION_TITLE_ROOM,
  settleBoard,
} from './index.ts'

const shapes = { items: { one: { width: 100, height: 50 }, two: { width: 100, height: 100 }, three: { width: 100, height: 100 } }, labels: {} }
const board = (direction: Board['direction'] = 'ltr'): Board => ({
  title: 'Board',
  direction,
  items: [
    { id: 'one', kind: 'deck', address: 'one', x: 100, y: 100, width: 100 },
    { id: 'two', kind: 'page', address: 'two', x: 260, y: 120, width: 80 },
    { id: 'three', kind: 'page', address: 'three', x: 500, y: 100, width: 100 },
  ],
  labels: [],
  sections: [
    { id: 'first', title: 'First', rectangle: { x: 50, y: 40, width: 320, height: 220 }, items: ['one', 'two'] },
    { id: 'second', title: 'Second', rectangle: { x: 450, y: 40, width: 200, height: 220 }, items: ['three'] },
  ],
})

describe('section fitting and membership', () => {
  test('fits member bounds with title room and gives an empty section its minimum size', () => {
    const fitted = fitSection(board(), shapes, 'first').sections[0]?.rectangle
    expect(fitted).toEqual({
      x: 100 - SECTION_PADDING,
      y: 100 - SECTION_PADDING - SECTION_TITLE_ROOM,
      width: 240 + SECTION_PADDING * 2,
      height: 100 + SECTION_PADDING * 2 + SECTION_TITLE_ROOM,
    })
    const emptySection = board().sections[0]
    if (!emptySection) throw new Error('fixture section is missing')
    const empty = { ...board(), sections: [{ ...emptySection, items: [] }] }
    expect(fitSection(empty, shapes, 'first').sections[0]?.rectangle).toEqual({ x: 50, y: 40, ...SECTION_MIN_SIZE })
  })

  test('joins, leaves and moves between the topmost sections while preserving order', () => {
    const joined = assignMembership(board(), shapes, ['three'], { x: 200, y: 100 })
    expect(joined.sections.map((section) => section.items)).toEqual([['one', 'two', 'three'], []])
    const moved = assignMembership(joined, shapes, ['one'], { x: 520, y: 100 })
    expect(moved.sections.map((section) => section.items)).toEqual([['two', 'three'], ['one']])
    expect(assignMembership(moved, shapes, ['one'], { x: 900, y: 900 }).sections[1]?.items).toEqual([])
    const stacked = { ...board(), sections: board().sections.map((section) => ({ ...section, rectangle: { x: 0, y: 0, width: 600, height: 300 } })) }
    expect(assignMembership(stacked, shapes, ['one'], { x: 520, y: 100 }).sections[1]?.items).toEqual(['three', 'one'])
  })

  test('judges a dragged-out item against the section fitted without it', () => {
    const value = board()
    const assigned = assignMembership(value, shapes, ['two'], { x: 300, y: 130 })
    expect(assigned.sections[0]?.items).toEqual(['one'])
  })

  test('uses the same physical coordinates on right-to-left boards', () => {
    expect(fitSection(board('rtl'), shapes, 'first')).toEqual({ ...fitSection(board(), shapes, 'first'), direction: 'rtl' })
    expect(assignMembership(board('rtl'), shapes, ['three'], { x: 200, y: 100 }).sections[0]?.items).toEqual(['one', 'two', 'three'])
  })
})

describe('section room', () => {
  test('moves a neighbor by the least distance and never moves the changed section or members', () => {
    const value = {
      ...board(),
      items: board().items.map((item) => (item.id === 'three' ? { ...item, x: 380 } : item)),
      sections: board().sections.map((section, index) => (index === 1 ? { ...section, rectangle: { ...section.rectangle, x: 330 } } : section)),
    }
    const settled = makeRoom(value, shapes, ['first'])
    expect(settled.sections[0]).toEqual(value.sections[0])
    expect(settled.items.find((item) => item.id === 'one')).toEqual(value.items[0])
    expect(settled.sections[1]?.rectangle.x).toBe(386)
    expect(settled.items.find((item) => item.id === 'three')?.x).toBe(436)
  })

  test('cascades through two neighbors', () => {
    const value: Board = {
      ...board(),
      items: board().items.map((item, index) => ({ ...item, x: [20, 180, 270][index] ?? 0, y: 100, width: 80 })),
      sections: [{ id: 'first', title: 'First', rectangle: { x: 0, y: 0, width: 100, height: 200 }, items: [] }],
    }
    const settled = makeRoom(value, shapes, ['first'])
    expect(settled.items.map((item) => item.x)).toEqual([116, 212, 308])
  })

  test('moves a section with its members', () => {
    const value = {
      ...board(),
      sections: board().sections.map((section, index) => (index === 1 ? { ...section, rectangle: { ...section.rectangle, x: 300 } } : section)),
    }
    const settled = makeRoom(value, shapes, ['first'])
    const beforeX = value.sections[1]?.rectangle.x
    const afterX = settled.sections[1]?.rectangle.x
    if (beforeX === undefined || afterX === undefined) throw new Error('fixture section is missing')
    const delta = afterX - beforeX
    expect(settled.items.find((item) => item.id === 'three')?.x).toBe(500 + delta)
  })

  test('stops a cascade at the pass limit', () => {
    const items = Array.from({ length: MAKE_ROOM_LIMIT + 2 }, (_, index) => ({
      id: `item-${index}`,
      kind: 'page' as const,
      address: `${index}`,
      x: 20 + index * 90,
      y: 20,
      width: 80,
    }))
    const value: Board = {
      title: 'Limit',
      direction: 'ltr',
      items,
      labels: [],
      sections: [{ id: 'changed', title: 'Changed', rectangle: { x: 0, y: 0, width: 100, height: 100 }, items: [] }],
    }
    const manyShapes = { items: Object.fromEntries(items.map((item) => [item.id, { width: 80, height: 80 }])), labels: {} }
    const settled = makeRoom(value, manyShapes, ['changed'])
    expect(settled.items.at(-1)?.x).toBe(items.at(-1)?.x)
  })

  test('settles sections named directly because they lost a touched member', () => {
    const assigned = assignMembership(board(), shapes, ['two'], { x: 900, y: 900 })
    expect(settleBoard(assigned, shapes, ['two', 'first']).sections[0]?.rectangle.width).toBe(100 + SECTION_PADDING * 2)
  })
})
