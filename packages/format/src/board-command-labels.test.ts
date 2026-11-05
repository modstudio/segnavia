import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import type { BoardCommand } from './board-commands.ts'
import { boardShapes, type ComputedBoardShapes } from './board-shapes.ts'
import { editBoard } from './edit-board.ts'

function fixture(direction: Board['direction'] = 'ltr'): Board {
  return {
    title: 'Board',
    direction,
    items: [{ id: 'a', kind: 'page', address: 'a', x: 100, y: 100, width: 100 }],
    labels: [{ id: 'old', text: 'Old', x: 300, y: 100, size: { width: 30, height: 20 } }],
    sections: [],
  }
}

const shapes = (board: Board): ComputedBoardShapes => boardShapes(board, { a: { kind: 'page', size: { width: 2, height: 1 } } })

function success(result: ReturnType<typeof editBoard>) {
  if (!result.ok) throw new Error(result.refusal)
  return result
}

describe('board label commands', () => {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`adds, moves and removes a label in ${direction}`, () => {
      const before = fixture(direction)
      const added = success(editBoard(before, [{ type: 'label-add', id: 'new', text: 'New', target: { beside: { id: 'a' }, side: 'start' } }], shapes(before)))
      const label = added.board.labels.find((entry) => entry.id === 'new')
      expect(direction === 'ltr' ? (label?.x ?? 0) < 100 : (label?.x ?? 0) > 200).toBe(true)
      expect(added.adjustments).toContainEqual(expect.objectContaining({ kind: 'estimated-shape', id: 'new' }))
      const moved = success(
        editBoard(
          added.board,
          [{ type: 'label-set', label: { id: 'new' }, target: { at: { x: 20, y: 30 } } }],
          boardShapes(added.board, { a: { kind: 'page', size: { width: 2, height: 1 } } }),
        ),
      )
      expect(moved.board.labels.find((entry) => entry.id === 'new')).toMatchObject({ x: 20, y: 30 })
      const removed = success(
        editBoard(
          moved.board,
          [{ type: 'label-remove', labels: [{ id: 'new' }] }],
          boardShapes(moved.board, { a: { kind: 'page', size: { width: 2, height: 1 } } }),
        ),
      )
      expect(removed.board.labels.map((entry) => entry.id)).toEqual(['old'])
    })

    test(`places a label after existing content by default in ${direction}`, () => {
      const before = fixture(direction)
      before.items[0] = { id: 'a', kind: 'page', address: 'a', x: 500, y: 400, width: 100 }
      before.labels = []
      const result = success(editBoard(before, [{ type: 'label-add', id: 'new', text: 'New' }], shapes(before)))
      expect(result.board.labels[0]).toMatchObject({ x: direction === 'ltr' ? 616 : 460, y: 400 })
      expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'default-target', id: 'new' }))
    })
  }

  test('clears stored size and measures changed text for the working batch', () => {
    const before = fixture()
    const result = success(
      editBoard(
        before,
        [
          { type: 'label-set', label: { id: 'old' }, text: 'Measured' },
          { type: 'label-set', label: { id: 'old' }, target: { beside: { id: 'a' }, side: 'below' } },
        ],
        shapes(before),
        { measureLabel: () => ({ width: 88, height: 24 }) },
      ),
    )
    expect(result.board.labels[0]?.size).toEqual({ width: 88, height: 24 })
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'measured-label', id: 'old' }))
    expect(result.changed).toContainEqual(expect.objectContaining({ kind: 'label', id: 'old' }))
  })

  test('clears stored size and estimates changed text', () => {
    const before = fixture()
    const result = success(editBoard(before, [{ type: 'label-set', label: { id: 'old' }, text: 'A much longer label' }], shapes(before)))
    expect(result.board.labels[0]).not.toHaveProperty('size')
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'estimated-shape', id: 'old' }))
    expect(result.changed).toContainEqual(expect.objectContaining({ kind: 'label', id: 'old' }))
  })

  test('reports an estimated label used to place another label', () => {
    const before = fixture()
    delete before.labels[0]?.size
    const computed = shapes(before)
    const result = success(editBoard(before, [{ type: 'label-add', id: 'new', text: 'New', target: { beside: { id: 'old' }, side: 'below' } }], computed))
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'estimated-shape', id: 'old' }))
  })

  test('refuses invalid label commands with the shared refusal format', () => {
    const before = fixture()
    const cases: Array<[unknown, RegExp, Parameters<typeof editBoard>[2], Parameters<typeof editBoard>[3]?]> = [
      [{ type: 'label-set', label: { id: 'missing' }, text: 'x' }, /label id "missing" does not exist.*pass the id of an existing label/, shapes(before)],
      [{ type: 'label-add', id: 'a', text: 'x' }, /id "a" already exists.*supply a unique id/, shapes(before)],
      [{ type: 'label-add', text: 'x' }, /new label has no id.*supply an id or a newId option/, shapes(before)],
      [{ type: 'label-remove', labels: [{ id: 'old' }, { id: 'old' }] }, /label "old" is named more than once.*name every label at most once/, shapes(before)],
      [
        { type: 'label-add', id: 'new', text: 'x' },
        /label "new" measured 0x0.*return a positive width and height from measureLabel/,
        shapes(before),
        { measureLabel: () => ({ width: 0, height: 0 }) },
      ],
      [{ type: 'label-set', label: { id: 'old' } }, /requires at least one of text or target.*pass a command matching BoardCommand/, shapes(before)],
      [
        { type: 'label-set', label: { id: 'old' }, target: { free: true } },
        /label "old" has no resolved shape.*pass the resolved shape/,
        { ...shapes(before), shapes: { ...shapes(before).shapes, labels: {} } },
      ],
    ]
    for (const [command, expected, supplied, options] of cases) {
      const result = editBoard(before, [command] as BoardCommand[], supplied, options)
      expect(result.ok ? '' : result.refusal).toMatch(expected)
      expect(result.ok ? '' : result.refusal).toMatch(/^board command 0 .*Nothing was changed\.$/)
    }
  })
})
