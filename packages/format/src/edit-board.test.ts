import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import type { BoardCommand } from './board-commands.ts'
import { applyBoardOps } from './board-ops.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'
import { editBoard } from './edit-board.ts'

const item = (id: string, address = id, x = 0) => ({ id, kind: 'page' as const, address, x, y: 0, width: 100 })
const board = (direction: Board['direction'] = 'ltr'): Board => ({
  title: 'B',
  direction,
  items: [item('a', 'shared'), item('b', 'shared', 200), item('c', 'c', 400)],
  labels: [],
  sections: [{ id: 's', title: 'Pages', rectangle: { x: 0, y: 200, width: 500, height: 200 }, items: [], layout: 'manual' }],
})
const shapes: ComputedBoardShapes = {
  shapes: {
    items: { a: { width: 100, height: 50 }, b: { width: 100, height: 50 }, c: { width: 100, height: 50 } },
    labels: {},
  },
  provisional: [],
  estimated: [],
}

function success(value: ReturnType<typeof editBoard>) {
  if (!value.ok) throw new Error(value.refusal)
  return value
}

function expectChangedCoverage(before: Board, after: Board, changed: ReadonlySet<string>): void {
  for (const item of after.items) {
    const previous = before.items.find((entry) => entry.id === item.id)
    if (previous && (previous.x !== item.x || previous.y !== item.y || previous.width !== item.width)) expect(changed.has(item.id)).toBe(true)
  }
  for (const section of after.sections) {
    const previous = before.sections.find((entry) => entry.id === section.id)
    if (previous && JSON.stringify(previous.rectangle) !== JSON.stringify(section.rectangle)) expect(changed.has(section.id)).toBe(true)
  }
  for (const label of after.labels) {
    const previous = before.labels.find((entry) => entry.id === label.id)
    if (previous && (previous.x !== label.x || previous.y !== label.y)) expect(changed.has(label.id)).toBe(true)
  }
}

describe('editBoard item commands', () => {
  test('adds, moves a group, resizes, removes and arranges in one atomic batch', () => {
    const result = success(
      editBoard(
        board(),
        [
          { type: 'item-add', kind: 'page', address: 'new', target: { at: { x: 10, y: 20 } } },
          { type: 'item-move', items: [{ id: 'a' }, { id: 'b' }], target: { beside: { id: 'c' }, side: 'below' } },
          { type: 'item-resize', item: { id: 'c' }, width: 8 },
          { type: 'item-remove', items: [{ id: 'b' }] },
          { type: 'arrange', columns: 2 },
        ],
        shapes,
        { newId: () => 'new', facts: { new: { kind: 'page', size: { width: 100, height: 50 } } }, detail: 'full' },
      ),
    )
    expect(result.board.items.map((entry) => entry.id)).toEqual(['a', 'c', 'new'])
    expect(result.adjustments.some((entry) => entry.kind === 'generated-id')).toBe(true)
    expect(result.adjustments.some((entry) => entry.kind === 'width-clamped')).toBe(true)
    expect(applyBoardOps(board(), result.ops)).toEqual(result.board)
    expect(result.changed.every((entry) => entry.box)).toBe(true)
  })

  test('arranges one named section into the requested grid', () => {
    const before = board()
    const section = before.sections[0]
    if (!section) throw new Error('test board has no section')
    before.sections[0] = { ...section, items: ['a', 'b', 'c'] }
    const result = success(editBoard(before, [{ type: 'arrange', section: { title: 'Pages' }, columns: 2 }], shapes))
    expect(result.board.sections[0]?.layout).toBe('auto')
    expect(result.board.sections[0]?.cells).toEqual([
      { id: 'a', row: 0, column: 0 },
      { id: 'b', row: 0, column: 1 },
      { id: 'c', row: 1, column: 0 },
    ])
  })

  for (const direction of ['ltr', 'rtl'] as const) {
    test(`defaults resize anchor to logical start in ${direction}`, () => {
      const result = success(editBoard(board(direction), [{ type: 'item-resize', item: { id: 'a' }, width: 120 }], shapes))
      expect(result.board.items[0]?.x).toBe(direction === 'ltr' ? 0 : -20)
    })

    test(`maps an explicit logical resize anchor in ${direction}`, () => {
      const result = success(editBoard(board(direction), [{ type: 'item-resize', item: { id: 'a' }, width: 120, anchor: 'top-end' }], shapes))
      expect(result.board.items[0]?.x).toBe(direction === 'ltr' ? -20 : 0)
    })
  }

  test('nudges beside placement past a collision without moving the obstacle', () => {
    const before = board()
    const third = before.items.find((entry) => entry.id === 'c')
    if (!third) throw new Error('test board has no third item')
    before.items = before.items.map((entry) => (entry.id === 'c' ? { ...entry, x: 332 } : entry))
    const result = success(editBoard(before, [{ type: 'item-move', items: [{ id: 'a' }], target: { beside: { id: 'b' }, side: 'end' } }], shapes))
    const moved = result.board.items.find((entry) => entry.id === 'a')
    const obstacle = result.board.items.find((entry) => entry.id === 'c')
    expect((moved?.x ?? 0) >= (obstacle?.x ?? 0) + (obstacle?.width ?? 0)).toBe(true)
    expect(obstacle).toEqual({ ...third, x: 332 })
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'nudge', id: 'c' }))
  })

  test('reports only an estimated label whose box the command used', () => {
    const before = board()
    before.labels = [
      { id: 'used', text: 'Used', x: 700, y: 0 },
      { id: 'unused', text: 'Unused', x: 900, y: 0 },
    ]
    const withLabels: ComputedBoardShapes = {
      ...shapes,
      shapes: { ...shapes.shapes, labels: { used: { width: 40, height: 20 }, unused: { width: 40, height: 20 } } },
      estimated: ['used', 'unused'],
    }
    const result = success(editBoard(before, [{ type: 'item-move', items: [{ id: 'a' }], target: { beside: { id: 'used' }, side: 'above' } }], withLabels))
    expect(result.adjustments.filter((entry) => entry.kind === 'estimated-shape').map((entry) => entry.id)).toEqual(['used'])
  })

  test('refusals name the index, remedy, and atomic outcome', () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ type: 'item-move', items: [{ id: 'missing' }], target: { free: true } }, /pass the id or unique address/],
      [{ type: 'item-remove', items: [{ address: 'shared' }] }, /matches a, b.*address that names exactly one item/],
      [{ type: 'item-add', id: 'new', kind: 'page', address: 'missing', target: { free: true } }, /pass its resolved fact/],
      [{ type: 'item-move', items: [{ id: 'a' }], target: { section: { id: 'missing' } } }, /pass the id or unique title/],
      [{ type: 'item-resize', item: { id: 'a' }, width: 0 }, /pass a width greater than zero/],
      [{ type: 'wat' }, /pass a command matching BoardCommand/],
    ]
    for (const [command, expected] of cases) {
      const result = editBoard(board(), [command] as BoardCommand[], shapes)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.refusal).toMatch(expected)
        expect(result.refusal).toMatch(/^board command 0 \(.+\) refused:/)
        expect(result.refusal.endsWith('Nothing was changed.')).toBe(true)
      }
    }
  })

  test('refuses an ambiguous section title and a missing existing item shape', () => {
    const repeated = board()
    const section = repeated.sections[0]
    if (!section) throw new Error('test board has no section')
    repeated.sections.push({ ...section, id: 't' })
    const title = editBoard(repeated, [{ type: 'arrange', section: { title: 'Pages' } }], shapes)
    expect(title.ok ? '' : title.refusal).toMatch(/matches s, t.*title that names exactly one section/)
    const incomplete = structuredClone(shapes)
    delete incomplete.shapes.items.a
    const missing = editBoard(board(), [{ type: 'item-move', items: [{ id: 'a' }], target: { free: true } }], incomplete)
    expect(missing.ok ? '' : missing.refusal).toMatch(/item "a" has no resolved shape.*pass the resolved shape/)
  })

  test('a bad third command returns no board or ops and leaves the input untouched', () => {
    const before = board()
    const snapshot = structuredClone(before)
    const result = editBoard(
      before,
      [
        { type: 'item-resize', item: { id: 'a' }, width: 120 },
        { type: 'item-move', items: [{ id: 'c' }], target: { free: true } },
        { type: 'item-remove', items: [{ id: 'missing' }] },
      ],
      shapes,
    )
    expect(result).toEqual({ ok: false, refusal: expect.stringMatching(/^board command 2 .*Nothing was changed\.$/) })
    expect(before).toEqual(snapshot)
    expect(result).not.toHaveProperty('ops')
  })

  test('seeded edits round-trip their ops and changed covers every moved entity', () => {
    let seed = 0x316
    const random = () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
      return seed / 0x1_0000_0000
    }
    for (let index = 0; index < 24; index += 1) {
      const before = board(index % 2 ? 'rtl' : 'ltr')
      const id = ['a', 'b', 'c'][Math.floor(random() * 3)] as string
      const result = success(editBoard(before, [{ type: 'item-move', items: [{ id }], target: { at: { x: random() * 300, y: random() * 150 } } }], shapes))
      expect(applyBoardOps(before, result.ops)).toEqual(result.board)
      const changed = new Set(result.changed.map((entry) => entry.id))
      expectChangedCoverage(before, result.board, changed)
    }
  })
})
