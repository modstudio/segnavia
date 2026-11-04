import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { addItem, moveItems, moveSection, removeItems, resizeItem } from './board-edit.ts'
import { arrange, type BoardShapes } from './board-geometry.ts'
import { applyBoardOps } from './board-ops.ts'
import { diffBoards, invertOps } from './board-ops-diff.ts'
import { makeRoom, settleBoard } from './board-sections.ts'

const item = (id: string, x = 0) => ({ id, kind: 'page' as const, address: `pages/${id}`, x, y: 0, width: 100 })
const rectangle = { x: 0, y: 0, width: 300, height: 200 }
const board = (members: string[] = ['a', 'b', 'c']): Board => ({
  title: 'Board',
  direction: 'ltr',
  items: ['a', 'b', 'c'].map((id) => item(id)),
  labels: [],
  sections: [{ id: 's', title: 'S', rectangle, items: members, layout: 'manual' }],
})

describe('diffBoards and invertOps', () => {
  test('an unchanged board diffs to nothing', () => expect(diffBoards(board(), board())).toEqual([]))

  test('a reorder emits only moved members and reproduces exact order', () => {
    const before = board()
    const after = board(['c', 'a', 'b'])
    const ops = diffBoards(before, after)
    expect(ops).toEqual([{ type: 'member-set', section: 's', item: 'c', from: { after: 'b' }, to: { after: null } }])
    expect(applyBoardOps(before, ops)).toEqual(after)
  })

  test('a section move emits a leave and join', () => {
    const before = board(['a', 'b'])
    before.sections.push({ id: 't', title: 'T', rectangle: { ...rectangle, x: 400 }, items: ['c'], layout: 'manual' })
    const after = structuredClone(before)
    ;(after.sections[0] as Board['sections'][number]).items = ['b']
    ;(after.sections[1] as Board['sections'][number]).items = ['c', 'a']
    const ops = diffBoards(before, after)
    expect(ops.filter((op) => op.type === 'member-set' && op.item === 'a')).toEqual([
      { type: 'member-set', section: 's', item: 'a', from: { after: null }, to: null },
      { type: 'member-set', section: 't', item: 'a', from: null, to: { after: 'c' } },
    ])
    expect(applyBoardOps(before, ops)).toEqual(after)
  })

  test('sets carry only changed fields, including board fields', () => {
    const before = board()
    const after = structuredClone(before)
    after.title = 'Other'
    after.direction = 'rtl'
    ;(after.items[0] as Board['items'][number]).x = 20
    expect(diffBoards(before, after)).toEqual([
      { type: 'board-set', from: { title: 'Board', direction: 'ltr' }, to: { title: 'Other', direction: 'rtl' } },
      { type: 'item-set', id: 'a', from: { x: 0 }, to: { x: 20 } },
    ])
  })

  test('round trips additions, removals, top-level order, cells and inverse', () => {
    const before = board()
    const after: Board = {
      title: 'After',
      direction: 'rtl',
      items: [item('c', 4), item('d')],
      labels: [{ id: 'l', text: 'L', x: 1, y: 2 }],
      sections: [
        {
          id: 't',
          title: 'T',
          rectangle,
          items: ['d', 'c'],
          cells: [
            { id: 'd', row: 0, column: 0 },
            { id: 'c', row: 0, column: 1 },
          ],
        },
      ],
    }
    const ops = diffBoards(before, after)
    expect(applyBoardOps(before, ops)).toEqual(after)
    expect(applyBoardOps(after, invertOps(ops, before))).toEqual(before)
  })

  test('broken anchor order is detected', () => {
    const before = board()
    const after = board(['c', 'a', 'b'])
    const ops = diffBoards(before, after)
    const broken = ops.map((op) => (op.type === 'member-set' ? { ...op, from: { after: 'missing' } } : op))
    expect(() => applyBoardOps(before, broken)).toThrow(/member "c" does not match from/)
  })

  test('seeded board edits round trip through diff and inverse', () => {
    const random = mulberry32(0x265b0a4d)
    const shapes: BoardShapes = {
      items: { a: { width: 100, height: 80 }, b: { width: 100, height: 70 }, c: { width: 100, height: 60 }, d: { width: 100, height: 50 } },
      labels: { l: { width: 50, height: 20 } },
    }
    for (let index = 0; index < 56; index += 1) {
      const before = generatedBoard(random)
      let edited: Board
      const amount = 10 + Math.floor(random() * 30)
      switch (index % 7) {
        case 0:
          edited = addItem(before, item('d', amount))
          break
        case 1:
          edited = removeItems(before, ['c'])
          break
        case 2:
          edited = moveItems(before, ['a'], { x: amount, y: -amount })
          break
        case 3:
          edited = resizeItem(before, 'b', 100 + amount, 'bottom-right', (width) => width * 0.75)
          break
        case 4:
          edited = arrange(before, shapes, { layout: 'grid', gap: amount, columns: 2 })
          break
        case 5:
          edited = moveSection(before, 's', { x: amount, y: amount })
          break
        default:
          edited = makeRoom(moveItems(before, ['a'], { x: 250, y: 0 }), shapes, ['a'])
      }
      if (index % 5 === 0) edited = { ...edited, title: `Board ${index}` }
      if (index % 11 === 0) edited = { ...edited, direction: edited.direction === 'ltr' ? 'rtl' : 'ltr' }
      const after = settleBoard(before, edited, shapes, ['a', 'b', 'c', 'd', 's'])
      const ops = diffBoards(before, after)
      expect(applyBoardOps(before, ops)).toEqual(after)
      expect(applyBoardOps(after, invertOps(ops, before))).toEqual(before)
    }

    const before = generatedBoard(random)
    const after = { ...before, sections: before.sections.map((section) => (section.id === 's' ? { ...section, items: ['b', 'a'] } : section)) }
    const ops = diffBoards(before, after)
    const broken = ops.map((op) => (op.type === 'member-set' ? { ...op, from: { after: 'missing' } } : op))
    expect(() => applyBoardOps(before, broken)).toThrow(/refused/)
  })
})

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function generatedBoard(random: () => number): Board {
  const offset = Math.floor(random() * 40)
  return {
    title: 'Board',
    direction: random() < 0.5 ? 'ltr' : 'rtl',
    items: [item('a', offset), { ...item('b', 120 + offset), width: 110 }, item('c', 500 + offset)],
    labels: [{ id: 'l', text: 'Label', x: 250, y: 300 }],
    sections: [
      { id: 's', title: 'S', rectangle: { x: offset - 20, y: -30, width: 270, height: 160 }, items: ['a', 'b'], layout: 'manual' },
      { id: 't', title: 'T', rectangle: { x: 480 + offset, y: -30, width: 140, height: 140 }, items: ['c'], layout: 'manual' },
    ],
  }
}
