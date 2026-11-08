import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import type { BoardCommand } from './board-commands.ts'
import { documentForBoard, editBoardForBoard as editBoard } from './board-document-test-helper.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'
import { applyOps } from './document-apply.ts'
import { boardFromDocument, documentFromBoard } from './document-lowering.ts'

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
  test('applies and reports the default width through editBoard', () => {
    const result = success(
      editBoard(board(), [{ type: 'item-add', id: 'new', kind: 'page', address: 'new', target: { free: true } }], shapes, {
        facts: { new: { kind: 'page', size: { width: 2, height: 1 } } },
      }),
    )
    expect(result.board.items.find((entry) => entry.id === 'new')?.width).toBe(320)
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'default-width', id: 'new' }))
  })

  test('adds, moves a group, resizes, removes and arranges in one atomic batch', () => {
    const before = board()
    const input = documentForBoard(before)
    const result = success(
      editBoard(
        before,
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
    expect(boardFromDocument(applyOps(input, result.batch))).toEqual(result.board)
    expect(result.document).toEqual(applyOps(input, result.batch))
    expect(result.document).toEqual(documentFromBoard(result.board, input))
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
    test(`adds an item on the logical start side in ${direction}`, () => {
      const before = board(direction)
      before.items = [item('a')]
      const result = success(
        editBoard(before, [{ type: 'item-add', id: 'new', kind: 'page', address: 'new', width: 40, target: { beside: { id: 'a' }, side: 'start' } }], shapes, {
          facts: { new: { kind: 'page', size: { width: 1, height: 1 } } },
        }),
      )
      const added = result.board.items.find((entry) => entry.id === 'new')
      const reference = result.board.items.find((entry) => entry.id === 'a')
      if (!added || !reference) throw new Error('added item and reference must exist')
      expect(direction === 'ltr' ? added.x + added.width < reference.x : added.x > reference.x + reference.width).toBe(true)
    })

    test(`moves an item to the logical end side in ${direction}`, () => {
      const before = board(direction)
      before.items = [item('a'), item('c', 'c', 400)]
      const result = success(editBoard(before, [{ type: 'item-move', items: [{ id: 'a' }], target: { beside: { id: 'c' }, side: 'end' } }], shapes))
      const moved = result.board.items.find((entry) => entry.id === 'a')
      const reference = result.board.items.find((entry) => entry.id === 'c')
      if (!moved || !reference) throw new Error('moved item and reference must exist')
      expect(direction === 'ltr' ? moved.x > reference.x + reference.width : moved.x + moved.width < reference.x).toBe(true)
    })

    test(`arranges the second item on the logical end side in ${direction}`, () => {
      const result = success(editBoard(board(direction), [{ type: 'arrange', columns: 2 }], shapes))
      const first = result.board.items.find((entry) => entry.id === 'a')
      const second = result.board.items.find((entry) => entry.id === 'b')
      expect((second?.x ?? 0) > (first?.x ?? 0)).toBe(direction === 'ltr')
    })

    test(`removes an item and round-trips its ops in ${direction}`, () => {
      const before = board(direction)
      const result = success(editBoard(before, [{ type: 'item-remove', items: [{ id: 'b' }] }], shapes))
      expect(result.board.items.map((entry) => entry.id)).toEqual(['a', 'c'])
      expect(boardFromDocument(applyOps(documentForBoard(before), result.batch))).toEqual(result.board)
    })

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

  test('reports provisional shapes only when a command reads them', () => {
    const provisional = { ...shapes, provisional: ['b'] }
    const moved = success(editBoard(board(), [{ type: 'item-move', items: [{ id: 'b' }], target: { at: { x: 20, y: 30 } } }], provisional))
    expect(moved.adjustments).toContainEqual(expect.objectContaining({ kind: 'provisional-shape', id: 'b' }))

    const looseRemoval = success(editBoard(board(), [{ type: 'item-remove', items: [{ id: 'b' }] }], provisional))
    expect(looseRemoval.adjustments).not.toContainEqual(expect.objectContaining({ kind: 'provisional-shape', id: 'b' }))

    const inGrid = board()
    const section = inGrid.sections[0]
    if (!section) throw new Error('test board has no section')
    inGrid.sections[0] = { ...section, layout: 'auto', items: ['b'], cells: [{ id: 'b', row: 0, column: 0 }] }
    const gridRemoval = success(editBoard(inGrid, [{ type: 'item-remove', items: [{ id: 'b' }] }], provisional))
    expect(gridRemoval.adjustments).toContainEqual(expect.objectContaining({ kind: 'provisional-shape', id: 'b' }))
  })

  test('reuses an existing item shape and reports when it is provisional', () => {
    const before: Board = { title: 'B', direction: 'ltr', items: [item('a', 'shared')], labels: [], sections: [] }
    const existingShapes: ComputedBoardShapes = {
      shapes: { items: { a: { width: 4, height: 3 } }, labels: {} },
      provisional: ['a'],
      estimated: [],
    }
    const result = success(
      editBoard(before, [{ type: 'item-add', id: 'new', kind: 'page', address: 'shared', width: 80, target: { free: true } }], existingShapes, {
        detail: 'full',
      }),
    )
    expect(result.board.items.find((entry) => entry.id === 'new')).toMatchObject({ width: 80 })
    expect(result.changed.find((entry) => entry.id === 'new')?.box).toMatchObject({ width: 80, height: 60 })
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'provisional-shape', id: 'new' }))
  })

  test('names fact kind mismatches and existing-address conflicts', () => {
    const mismatch = editBoard(board(), [{ type: 'item-add', id: 'new', kind: 'page', address: 'new', target: { free: true } }], shapes, {
      facts: { new: { kind: 'media', size: { width: 4, height: 3 } } },
    })
    expect(mismatch.ok ? '' : mismatch.refusal).toMatch(/has a media shape fact instead of page.*pass a page fact/)

    const conflict = editBoard(board(), [{ type: 'item-add', id: 'new', kind: 'media', address: 'c', target: { free: true } }], shapes, {
      facts: { c: { kind: 'media', size: { width: 4, height: 3 } } },
    })
    expect(conflict.ok ? '' : conflict.refusal).toMatch(/belongs to a page item instead of media.*pass a media fact for a distinct address/)
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
    for (let index = 0; index < 35; index += 1) {
      const before = board(index % 2 ? 'rtl' : 'ltr')
      const id = ['a', 'b', 'c'][Math.floor(random() * 3)] as string
      let command: BoardCommand
      let suppliedShapes = shapes
      switch (index % 7) {
        case 0:
          command = { type: 'item-move', items: [{ id }], target: { at: { x: random() * 300, y: random() * 150 } } }
          break
        case 1:
          command = { type: 'section-add', id: 'new', title: 'New', items: [{ id: 'a' }, { id: 'b' }], layout: index % 2 ? 'manual' : 'auto' }
          break
        case 2:
          command = { type: 'label-add', id: 'label', text: `Label ${index}`, target: { at: { x: random() * 300, y: random() * 150 } } }
          break
        case 3:
          command = { type: 'board-set', direction: before.direction === 'ltr' ? 'rtl' : 'ltr' }
          break
        case 4:
          before.labels = [{ id: 'label', text: 'Old', x: 10, y: 10, size: { width: 24, height: 19 } }]
          suppliedShapes = { ...shapes, shapes: { ...shapes.shapes, labels: { label: { width: 24, height: 19 } } } }
          command = { type: 'label-set', label: { id: 'label' }, text: `Changed ${index}` }
          break
        case 5:
          if (!before.sections[0]) throw new Error('test board has no section')
          before.sections[0] = { ...before.sections[0], items: ['a', 'b'], layout: 'manual' }
          command = { type: 'section-set', section: { id: 's' }, layout: 'auto' }
          break
        default:
          command = { type: 'section-remove', section: { id: 's' }, members: 'release' }
      }
      const result = success(editBoard(before, [command], suppliedShapes))
      expect(boardFromDocument(applyOps(documentForBoard(before), result.batch))).toEqual(result.board)
      const changed = new Set(result.changed.map((entry) => entry.id))
      expectChangedCoverage(before, result.board, changed)
    }
  })
})
