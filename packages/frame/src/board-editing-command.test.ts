import { describe, expect, test } from 'bun:test'
import { type Board, boardShapes, Document, documentFromBoard } from '@segnavia/format'
import { editBoardFromFrame, measureAddedLabels, resizeReleaseCommand } from './board-editing-command.ts'

const board: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [
    { id: 'a', kind: 'page', address: 'a', x: 10, y: 20, width: 100 },
    { id: 'b', kind: 'page', address: 'b', x: 300, y: 20, width: 100 },
  ],
  labels: [],
  sections: [],
}
const document = (value: Board) =>
  documentFromBoard(
    value,
    Document.parse({ type: 'document', id: 'board', kind: 'board', title: value.title, settings: { dir: value.direction }, children: [] }),
  )
describe('board editing release commands', () => {
  test('maps each dragged corner to the fixed logical anchor in both directions', () => {
    const resized = { ...board, items: board.items.map((item) => (item.id === 'a' ? { ...item, width: 140 } : item)) }
    const expected = {
      ltr: {
        'bottom-right': 'top-start',
        'bottom-left': 'top-end',
        'top-right': 'bottom-start',
        'top-left': 'bottom-end',
      },
      rtl: {
        'bottom-right': 'top-end',
        'bottom-left': 'top-start',
        'top-right': 'bottom-end',
        'top-left': 'bottom-start',
      },
    } as const
    for (const direction of ['ltr', 'rtl'] as const) {
      for (const [corner, anchor] of Object.entries(expected[direction])) {
        expect(resizeReleaseCommand({ ...resized, direction }, 'a', corner)).toMatchObject({ anchor, width: 140 })
      }
    }
  })

  test('passes measured label geometry through a label resize edit', () => {
    const before: Board = {
      ...board,
      items: [],
      labels: [{ id: 'label', text: 'Wrapped', x: 10, y: 20, width: 80, size: { width: 80, height: 19 } }],
    }
    const source = document(before)
    const result = editBoardFromFrame(source, [{ type: 'label-set', label: { id: 'label' }, width: 60 }], boardShapes(before, {}), {}, () => ({
      width: 60,
      height: 44,
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.board.labels[0]?.size).toEqual({ width: 60, height: 44 })
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'measured-label', id: 'label' }))
  })

  test('measures an unsized label added by host operations in the same document', () => {
    const before = document({ ...board, items: [], labels: [] })
    const added = document({ ...board, items: [], labels: [{ id: 'label', text: 'New', x: 10, y: 20 }] })
    const measured = measureAddedLabels(
      before,
      added,
      () => ({ width: 48, height: 20 }),
      (value) => documentFromBoard(value, added),
    )
    expect(measured.children.find((node) => node.id === 'label')).toMatchObject({ size: { width: 48, height: 20 } })
  })
})
