import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import type { BoardCommand } from './board-commands.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'
import { editBoard } from './edit-board.ts'

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

  test('refuses every section ambiguity and leaves the batch atomic', () => {
    const repeated = fixture()
    const first = repeated.sections[0]
    if (!first) throw new Error('test board has no section')
    repeated.sections.push({ ...first, id: 'other' })
    const cases: Array<[Board, unknown, RegExp]> = [
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
      [fixture(), { type: 'section-add', title: 'New' }, /new section has no id.*supply an id or a newId option/],
      [
        fixture(),
        { type: 'section-set', section: { id: 'old' }, items: [{ id: 'a' }, { id: 'c' }] },
        /missing \[b\] and has extra \[c\].*pass every current member/,
      ],
      [fixture(), { type: 'section-set', section: { id: 'old' } }, /requires at least one of title, layout or items.*pass a command matching BoardCommand/],
    ]
    const incomplete = structuredClone(shapes)
    delete incomplete.shapes.items.a
    const missingShape = editBoard(fixture(), [{ type: 'section-add', id: 'new', title: 'New', items: [{ id: 'a' }] }], incomplete)
    expect(missingShape.ok ? '' : missingShape.refusal).toMatch(/item "a" has no resolved shape.*pass the resolved shape/)
    for (const [board, command, expected] of cases) {
      const result = editBoard(board, [command] as BoardCommand[], shapes)
      expect(result.ok ? '' : result.refusal).toMatch(expected)
      expect(result.ok ? '' : result.refusal).toMatch(/^board command 0 .*Nothing was changed\.$/)
    }
  })
})
