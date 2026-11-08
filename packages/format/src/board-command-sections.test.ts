import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import type { BoardCommand } from './board-commands.ts'
import { editBoardForBoard as editBoard } from './board-document-test-helper.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'

const shapes: ComputedBoardShapes = {
  shapes: {
    items: { a: { width: 2, height: 1 }, b: { width: 2, height: 1 }, c: { width: 2, height: 1 } },
    labels: {},
  },
  provisional: [],
  estimated: [],
}

function fixture(direction: Board['direction'] = 'ltr'): Board {
  return {
    title: 'Board',
    direction,
    items: [
      { id: 'a', kind: 'page', address: 'a', x: 20, y: 40, width: 80 },
      { id: 'b', kind: 'page', address: 'b', x: 130, y: 40, width: 80 },
      { id: 'c', kind: 'page', address: 'c', x: 400, y: 40, width: 80 },
    ],
    labels: [],
    sections: [
      {
        id: 'old',
        title: 'Old',
        rectangle: { x: 0, y: 0, width: 240, height: 160 },
        items: ['a', 'b'],
        layout: 'manual',
      },
    ],
  }
}

function success(result: ReturnType<typeof editBoard>) {
  if (!result.ok) throw new Error(result.refusal)
  return result
}

describe('board section commands', () => {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`adds, edits and releases a section in ${direction}`, () => {
      const added = success(editBoard(fixture(direction), [{ type: 'section-add', id: 'new', title: 'New', items: [{ id: 'a' }, { id: 'b' }] }], shapes))
      const section = added.board.sections.find((entry) => entry.id === 'new')
      expect(section).toMatchObject({ title: 'New', layout: 'auto', items: ['a', 'b'] })
      expect(added.board.sections.find((entry) => entry.id === 'old')?.items).toEqual([])
      expect(added.adjustments.filter((entry) => entry.kind === 'membership-moved')).toHaveLength(2)

      const reordered = success(
        editBoard(added.board, [{ type: 'section-set', section: { id: 'new' }, title: 'Renamed', items: [{ id: 'b' }, { id: 'a' }] }], shapes),
      )
      expect(reordered.board.sections.find((entry) => entry.id === 'new')).toMatchObject({ title: 'Renamed', items: ['b', 'a'] })
      const released = success(editBoard(reordered.board, [{ type: 'section-remove', section: { id: 'new' }, members: 'release' }], shapes))
      expect(released.board.sections.some((entry) => entry.id === 'new')).toBe(false)
      expect(released.board.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    })

    test(`places a manual section as a group and removes its members in ${direction}`, () => {
      const result = success(
        editBoard(
          fixture(direction),
          [{ type: 'section-add', id: 'new', title: 'New', layout: 'manual', items: [{ id: 'a' }, { id: 'b' }], target: { at: { x: 600, y: 100 } } }],
          shapes,
        ),
      )
      expect(result.board.sections.find((entry) => entry.id === 'new')?.rectangle).toMatchObject({ x: 600, y: 100 })
      const removed = success(editBoard(result.board, [{ type: 'section-remove', section: { title: 'New' }, members: 'remove' }], shapes))
      expect(removed.board.items.map((entry) => entry.id)).toEqual(['c'])
    })

    test(`anchors an automatic section at its members' start edge in ${direction}`, () => {
      const before = fixture(direction)
      before.items = [
        { id: 'a', kind: 'page', address: 'a', x: 600, y: 40, width: 100 },
        { id: 'b', kind: 'page', address: 'b', x: 720, y: 40, width: 100 },
      ]
      before.sections = []
      const result = success(editBoard(before, [{ type: 'section-add', id: 'new', title: 'New', items: [{ id: 'a' }, { id: 'b' }] }], shapes))
      const section = result.board.sections[0]
      expect(direction === 'ltr' ? section?.rectangle.x : (section?.rectangle.x ?? 0) + (section?.rectangle.width ?? 0)).toBe(direction === 'ltr' ? 600 : 820)
    })

    test(`places an empty section after existing content by default in ${direction}`, () => {
      const before = fixture(direction)
      before.items = [{ id: 'a', kind: 'page', address: 'a', x: 500, y: 400, width: 100 }]
      before.sections = []
      const result = success(editBoard(before, [{ type: 'section-add', id: 'new', title: 'New' }], shapes))
      expect(result.board.sections[0]?.rectangle).toMatchObject({ x: direction === 'ltr' ? 616 : 244, y: 400 })
      expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'default-target', id: 'new' }))
    })
  }

  test('switches manual to auto with layout and auto to manual without moving members', () => {
    const automatic = success(editBoard(fixture(), [{ type: 'section-set', section: { id: 'old' }, layout: 'auto' }], shapes))
    expect(automatic.board.sections[0]?.cells).toHaveLength(2)
    expect(automatic.adjustments).toContainEqual(expect.objectContaining({ kind: 'auto-layout', id: 'old' }))
    const positions = automatic.board.items.map(({ id, x, y }) => ({ id, x, y }))
    const manual = success(editBoard(automatic.board, [{ type: 'section-set', section: { id: 'old' }, layout: 'manual' }], shapes))
    expect(manual.board.sections[0]?.cells).toBeUndefined()
    expect(manual.board.items.map(({ id, x, y }) => ({ id, x, y }))).toEqual(positions)
  })

  test('preserves an absent layout on title-only edits and emits no layout op', () => {
    const before = fixture()
    const section = before.sections[0]
    if (!section) throw new Error('test board has no section')
    delete section.layout
    const result = success(editBoard(before, [{ type: 'section-set', section: { id: 'old' }, title: 'Renamed' }], shapes))
    expect(result.board.sections[0]?.layout).toBeUndefined()
    const op = result.batch.ops.find((entry) => entry.type === 'setFields' && entry.id === 'old')
    expect(op).toMatchObject({ prior: { title: 'Old' }, fields: { title: 'Renamed' } })
    expect(op && 'prior' in op ? op.prior : {}).not.toHaveProperty('layout')
  })

  test('derives missing auto cells before reordering and when auto is restated', () => {
    const before = fixture()
    const section = before.sections[0]
    if (!section) throw new Error('test board has no section')
    section.layout = 'auto'
    delete section.cells
    const reordered = success(editBoard(before, [{ type: 'section-set', section: { id: 'old' }, items: [{ id: 'b' }, { id: 'a' }] }], shapes))
    expect(reordered.board.sections[0]?.cells).toEqual([
      { id: 'b', row: 0, column: 0 },
      { id: 'a', row: 0, column: 1 },
    ])
    expect(reordered.board.items.find((entry) => entry.id === 'a')?.y).toBe(reordered.board.items.find((entry) => entry.id === 'b')?.y)

    const restated = success(editBoard(before, [{ type: 'section-set', section: { id: 'old' }, layout: 'auto' }], shapes))
    expect(restated.board.sections[0]?.cells).toEqual([
      { id: 'a', row: 0, column: 0 },
      { id: 'b', row: 0, column: 1 },
    ])
  })

  test('reports an estimated label used to place a section', () => {
    const before = fixture()
    before.labels = [{ id: 'estimate', text: 'Estimate', x: 600, y: 100 }]
    const computed = { ...shapes, shapes: { ...shapes.shapes, labels: { estimate: { width: 64, height: 19 } } }, estimated: ['estimate'] }
    const result = success(
      editBoard(before, [{ type: 'section-add', id: 'new', title: 'New', target: { beside: { id: 'estimate' }, side: 'below' } }], computed),
    )
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'estimated-shape', id: 'estimate' }))
  })

  test('refuses every section ambiguity and leaves the batch atomic', () => {
    const repeated = fixture()
    const first = repeated.sections[0]
    if (!first) throw new Error('test board has no section')
    repeated.sections.push({ ...first, id: 'other' })
    const cases: Array<[Board, unknown, RegExp, Parameters<typeof editBoard>[3]?]> = [
      [
        fixture(),
        { type: 'section-remove', section: { id: 'missing' }, members: 'release' },
        /section id "missing" does not exist.*pass the id or unique title/,
      ],
      [
        repeated,
        { type: 'section-remove', section: { title: 'Old' }, members: 'release' },
        /section title "Old" is ambiguous \(matches old, other\).*title that names exactly one section/,
      ],
      [fixture(), { type: 'section-add', id: 'new', title: 'Old' }, /already belongs to section "old".*pick a title no other section has/],
      [fixture(), { type: 'section-add', id: 'a', title: 'New' }, /id "a" already exists.*supply a unique id/],
      [fixture(), { type: 'section-add', title: 'New' }, /new section has no id.*return a non-empty id from newId/, { newId: () => '' }],
      [
        fixture(),
        { type: 'section-set', section: { id: 'old' }, items: [{ id: 'a' }, { id: 'c' }] },
        /missing \[b\] and has extra \[c\].*pass every current member/,
      ],
      [
        fixture(),
        { type: 'section-set', section: { id: 'old' }, items: [{ id: 'a' }, { id: 'a' }] },
        /item "a" is named more than once.*name every item at most once/,
      ],
      [fixture(), { type: 'section-set', section: { id: 'old' } }, /requires at least one of title, layout or items.*pass a command matching BoardCommand/],
    ]
    const incomplete = structuredClone(shapes)
    delete incomplete.shapes.items.a
    const missingShape = editBoard(fixture(), [{ type: 'section-add', id: 'new', title: 'New', items: [{ id: 'a' }] }], incomplete)
    expect(missingShape.ok ? '' : missingShape.refusal).toMatch(/item "a" has no resolved shape.*pass the resolved shape/)
    for (const [board, command, expected, options] of cases) {
      const result = editBoard(board, [command] as BoardCommand[], shapes, options)
      expect(result.ok ? '' : result.refusal).toMatch(expected)
      expect(result.ok ? '' : result.refusal).toMatch(/^board command 0 .*Nothing was changed\.$/)
    }
  })
})
