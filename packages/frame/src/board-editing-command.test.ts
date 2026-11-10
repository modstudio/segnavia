import { describe, expect, test } from 'bun:test'
import { type Board, boardShapes, Document, diffDocuments, documentFromBoard } from '@segnavia/format'
import { editBoardFromFrame, prepareBoardApply, resizeReleaseCommand } from './board-editing-command.ts'

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
const geometry = (
  value: Board,
  measureLabel: (text: string, direction: Board['direction'], width: number | undefined) => { width: number; height: number },
) => ({
  computedShapes: () => boardShapes(value, {}),
  facts: () => ({}),
  measureLabel,
})
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
    const result = editBoardFromFrame(
      source,
      [{ type: 'label-set', label: { id: 'label' }, width: 60 }],
      geometry(before, () => ({ width: 60, height: 44 })),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.board.labels[0]?.size).toEqual({ width: 60, height: 44 })
    expect(result.adjustments).toContainEqual(expect.objectContaining({ kind: 'measured-label', id: 'label' }))
  })

  test('prepares an unsized label-add with its measurement in the same operation list', () => {
    const before = document({ ...board, items: [], labels: [] })
    const added = document({ ...board, items: [], labels: [{ id: 'label', text: 'New', x: 10, y: 20 }] })
    const prepared = prepareBoardApply(
      before,
      diffDocuments(before, added),
      () => ({ width: 48, height: 20 }),
      (value) => documentFromBoard(value, added),
    )
    expect(prepared.document.children.find((node) => node.id === 'label')).toMatchObject({ size: { width: 48, height: 20 } })
    expect(prepared.applied).toContainEqual(expect.objectContaining({ type: 'setFields', id: 'label', fields: { size: { width: 48, height: 20 } } }))
  })

  test('remeasures an existing label when host operations change its text or width', () => {
    const original = { id: 'label', text: 'Old', x: 10, y: 20, width: 80, size: { width: 80, height: 20 } }
    const before = document({ ...board, items: [], labels: [original] })
    const after = document({ ...board, items: [], labels: [{ ...original, text: 'Changed', width: 60 }] })
    const calls: Array<{ text: string; width: number | undefined }> = []
    const prepared = prepareBoardApply(
      before,
      diffDocuments(before, after),
      (text, _direction, width) => {
        calls.push({ text, width })
        return { width: 60, height: 44 }
      },
      (value) => documentFromBoard(value, after),
    )
    expect(calls).toEqual([{ text: 'Changed', width: 60 }])
    expect(prepared.document.children.find((node) => node.id === 'label')).toMatchObject({ size: { width: 60, height: 44 } })
  })

  test('keeps a host-provided replacement size when the same operations change a label', () => {
    const original = { id: 'label', text: 'Old', x: 10, y: 20, width: 80, size: { width: 80, height: 20 } }
    const before = document({ ...board, items: [], labels: [original] })
    const after = document({
      ...board,
      items: [],
      labels: [{ ...original, text: 'Changed', width: 60, size: { width: 60, height: 36 } }],
    })
    let measurements = 0
    const prepared = prepareBoardApply(
      before,
      diffDocuments(before, after),
      () => {
        measurements++
        return { width: 1, height: 1 }
      },
      (value) => documentFromBoard(value, after),
    )
    expect(measurements).toBe(0)
    expect(prepared.document.children.find((node) => node.id === 'label')).toMatchObject({ size: { width: 60, height: 36 } })
  })
})
