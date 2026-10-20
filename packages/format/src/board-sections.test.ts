import { describe, expect, test } from 'bun:test'
import {
  assignMembership,
  type Board,
  fitSection,
  fitTouchedSections,
  MAKE_ROOM_LIMIT,
  makeRoom,
  moveItems,
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
    { id: 'first', title: 'First', rectangle: { x: 50, y: 40, width: 320, height: 220 }, items: ['one', 'two'], layout: 'manual' },
    { id: 'second', title: 'Second', rectangle: { x: 450, y: 40, width: 200, height: 220 }, items: ['three'], layout: 'manual' },
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

  test('keeps a member dropped inside its starting rectangle before the live fit', () => {
    const value = board()
    const live = {
      ...value,
      items: value.items.map((item) => (item.id === 'two' ? { ...item, x: 500 } : item)),
    }
    expect(assignMembership(live, shapes, ['two'], { x: 300, y: 130 }, value.sections).sections[0]?.items).toEqual(['one', 'two'])
    expect(assignMembership(live, shapes, ['two'], { x: 800, y: 130 }, value.sections).sections[0]?.items).toEqual(['one'])
  })

  test('lets a sole member leave when membership is assigned on the moved, unfitted board', () => {
    const fixture = board()
    const first = fixture.sections[0]
    if (!first) throw new Error('fixture section is missing')
    const value = {
      ...fixture,
      sections: [{ ...first, items: ['one'] }],
    }
    const moved = moveItems(value, ['one'], { x: 800, y: 800 })
    const assigned = assignMembership(moved, shapes, ['one'], { x: 950, y: 925 }, value.sections)
    expect(assigned.sections[0]?.items).toEqual([])
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

  test('moves a measured label clear of a changed section', () => {
    const value: Board = {
      ...board(),
      labels: [{ id: 'label', text: 'Measured', x: 300, y: 100 }],
      sections: [{ id: 'first', title: 'First', rectangle: { x: 0, y: 0, width: 320, height: 220 }, items: ['one', 'two'] }],
    }
    const withLabel = { ...shapes, labels: { label: { width: 80, height: 20 } } }
    const settled = makeRoom(value, withLabel, ['first'])
    expect(settled.labels[0]).toEqual({ id: 'label', text: 'Measured', x: 336, y: 100 })
  })

  test('refuses to make room without a label shape', () => {
    const value: Board = {
      ...board(),
      labels: [{ id: 'label', text: '', x: 40, y: 40 }],
      sections: [{ id: 'first', title: 'First', rectangle: { x: 0, y: 0, width: 100, height: 100 }, items: [] }],
    }
    expect(() => makeRoom(value, shapes, ['first'])).toThrow('label "label" has no supplied shape; supply shapes.labels["label"]')
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

  test('fits a touched member for a live edit without making room', () => {
    const value = board()
    const moved = { ...value, items: value.items.map((item) => (item.id === 'two' ? { ...item, x: 460 } : item)) }
    const fitted = fitTouchedSections(value, moved, shapes, ['two'])
    expect(fitted.sections[0]?.rectangle.width).toBe(440 + SECTION_PADDING * 2)
    expect(fitted.items[2]?.x).toBe(500)
  })

  test('does not reflow an auto section during a live edit', () => {
    const value = board()
    const first = value.sections[0]
    if (!first) throw new Error('fixture section is missing')
    const auto = { ...value, sections: [{ ...first, layout: 'auto' as const }, ...value.sections.slice(1)] }
    const moved = moveItems(auto, ['two'], { x: 200, y: 0 })
    expect(fitTouchedSections(auto, moved, shapes, ['two'])).toBe(moved)
  })

  test('settles a section that lost a touched member', () => {
    const value = board()
    const assigned = assignMembership(value, shapes, ['two'], { x: 900, y: 900 })
    expect(settleBoard(value, assigned, shapes, ['two']).sections[0]?.rectangle.width).toBe(100 + SECTION_PADDING * 2)
  })
})
