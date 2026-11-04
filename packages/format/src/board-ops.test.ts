import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { applyBoardOps, type BoardOp } from './board-ops.ts'

const item = (id: string, x = 0) => ({ id, kind: 'page' as const, address: `pages/${id}`, x, y: 0, width: 100 })
const label = (id: string, x = 0) => ({ id, text: id, x, y: 0 })
const rectangle = { x: 0, y: 0, width: 200, height: 200 }
const empty: Board = { title: 'Board', direction: 'ltr', items: [], labels: [], sections: [] }

describe('applyBoardOps', () => {
  test('applies every operation type and exact anchors', () => {
    const ops: BoardOp[] = [
      { type: 'board-set', from: { title: 'Board' }, to: { title: 'Changed' } },
      { type: 'section-add', id: 's', section: { title: 'Section', rectangle, layout: null }, after: null },
      { type: 'item-add', id: 'a', item: item('a'), after: null },
      { type: 'item-add', id: 'b', item: item('b'), after: 'a' },
      { type: 'label-add', id: 'l', label: label('l'), after: null },
      { type: 'item-set', id: 'a', from: { x: 0 }, to: { x: 10 } },
      { type: 'label-set', id: 'l', from: { text: 'l' }, to: { text: 'Label' } },
      { type: 'section-set', id: 's', from: { title: 'Section', layout: null }, to: { title: 'Group', layout: 'auto' } },
      { type: 'member-set', section: 's', item: 'a', from: null, to: { after: null } },
      { type: 'member-set', section: 's', item: 'b', from: null, to: { after: 'a' } },
      {
        type: 'cells-set',
        section: 's',
        from: null,
        to: [
          { id: 'a', row: 0, column: 0 },
          { id: 'b', row: 0, column: 1 },
        ],
      },
    ]
    const added = applyBoardOps(empty, ops)
    expect(added).toEqual({
      title: 'Changed',
      direction: 'ltr',
      items: [item('a', 10), item('b')],
      labels: [{ ...label('l'), text: 'Label' }],
      sections: [
        {
          id: 's',
          title: 'Group',
          rectangle,
          layout: 'auto',
          items: ['a', 'b'],
          cells: [
            { id: 'a', row: 0, column: 0 },
            { id: 'b', row: 0, column: 1 },
          ],
        },
      ],
    })
    const removed = applyBoardOps(added, [
      { type: 'cells-set', section: 's', from: added.sections[0]?.cells ?? null, to: null },
      { type: 'member-set', section: 's', item: 'a', from: { after: null }, to: null },
      { type: 'member-set', section: 's', item: 'b', from: { after: null }, to: null },
      { type: 'item-remove', id: 'a', item: item('a', 10), after: null },
      { type: 'item-remove', id: 'b', item: item('b'), after: null },
      { type: 'label-remove', id: 'l', label: { ...label('l'), text: 'Label' }, after: null },
      { type: 'section-remove', id: 's', section: { title: 'Group', rectangle, layout: 'auto' }, after: null },
    ])
    expect(removed.items).toEqual([])
    expect(removed.labels).toEqual([])
    expect(removed.sections).toEqual([])
  })

  test('maps null back to absent layout and cells', () => {
    const board: Board = { ...empty, sections: [{ id: 's', title: 'S', rectangle, items: [], layout: 'manual', cells: [] }] }
    expect(
      applyBoardOps(board, [
        { type: 'section-set', id: 's', from: { layout: 'manual' }, to: { layout: null } },
        { type: 'cells-set', section: 's', from: [], to: null },
      ]).sections[0],
    ).toEqual({ id: 's', title: 'S', rectangle, items: [] })
  })

  test.each([
    ['missing id', [{ type: 'item-set', id: 'missing', from: { x: 0 }, to: { x: 1 } }]],
    [
      'existing id',
      [
        { type: 'item-add', id: 'a', item: item('a'), after: null },
        { type: 'item-add', id: 'a', item: item('a'), after: null },
      ],
    ],
    ['missing anchor', [{ type: 'item-add', id: 'a', item: item('a'), after: 'missing' }]],
    ['stale from', [{ type: 'board-set', from: { title: 'Old' }, to: { title: 'New' } }]],
  ] as const)('refuses a %s and names the op and remedy', (_name, ops) => {
    expect(() => applyBoardOps(empty, ops as unknown as BoardOp[])).toThrow(/board op \d+ \(.+\) refused: .+; diff again from the current board/)
  })

  test('refuses a result that Board cannot parse', () => {
    expect(() => applyBoardOps(empty, [{ type: 'item-add', id: 'a', item: { ...item('a'), width: 0 }, after: null }])).toThrow(/not a valid board/)
  })
})
