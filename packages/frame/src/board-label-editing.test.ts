import { describe, expect, test } from 'bun:test'
import type { Board, BoardLabel, BoardShapes, BoardView } from '@segnavia/format'
import { BoardDecorations } from './board-decorations.ts'
import { committedLabelText, labelDoubleClickTarget, labelResizeHandlePoint, withoutLabelWidth } from './board-label-editing.ts'

const view: BoardView = { zoom: 2, pan: { x: 10, y: 20 }, viewport: { width: 800, height: 600 } }
const shapes: BoardShapes = { items: { item: { width: 4, height: 3 } }, labels: { latin: { width: 80, height: 20 }, hebrew: { width: 70, height: 38 } } }

function fixture(): Board {
  return {
    title: 'Board',
    direction: 'rtl',
    items: [{ id: 'item', kind: 'page', address: 'page', x: 10, y: 20, width: 40 }],
    labels: [
      { id: 'latin', text: 'Latin', x: 100, y: 40 },
      { id: 'hebrew', text: 'עברית', x: 200, y: 80, width: 70, size: { width: 70, height: 38 } },
    ],
    sections: [],
  }
}

describe('label resize', () => {
  test("puts each label handle on the label's own inline-end edge", () => {
    const board = fixture()
    expect(labelResizeHandlePoint(board.labels[0] as BoardLabel, view, shapes.labels.latin as { width: number; height: number })).toEqual({ x: 370, y: 120 })
    expect(labelResizeHandlePoint(board.labels[1] as BoardLabel, view, shapes.labels.hebrew as { width: number; height: number })).toEqual({ x: 410, y: 218 })
  })
})

describe('label text editing', () => {
  test('uses the pointerdown label when pointer capture retargets double-click to the board', () => {
    const captured = labelDoubleClickTarget(undefined, 'hebrew')
    expect(labelDoubleClickTarget(undefined, undefined, captured)).toEqual({ kind: 'label', id: 'hebrew' })
  })

  test('keeps a resize handle distinct when pointer capture retargets double-click to the board', () => {
    const captured = labelDoubleClickTarget('hebrew', 'hebrew')
    expect(labelDoubleClickTarget(undefined, undefined, captured)).toEqual({ kind: 'handle', id: 'hebrew' })
  })

  test.each([
    ['unchanged text', 'Old text', 'Old text', undefined],
    ['empty text', 'Old text', '', undefined],
    ['whitespace-only text', 'Old text', ' \n\t', undefined],
    ['changed text', 'Old text', 'New text', 'New text'],
    ['changed Hebrew text', 'עברית', 'עברית חדשה', 'עברית חדשה'],
  ])('%s', (_name, oldText, newText, expected) => {
    expect(committedLabelText(oldText, newText)).toBe(expected)
  })

  test.each([
    ['ltr', 'Natural label', 100],
    ['rtl', 'תווית טבעית', 60],
  ] as const)('unwraps a %s label from its natural width', (direction, text, expectedX) => {
    const naturalSize = { width: 120, height: 20 }
    const content = { textContent: text, dir: direction, style: { display: 'block', whiteSpace: 'pre-wrap', inlineSize: '80px' } }
    const node = {
      style: { inlineSize: '80px' },
      querySelector: () => content,
      getBoundingClientRect: () => ({ width: node.style.inlineSize === '' ? naturalSize.width : 80, height: naturalSize.height }),
    }
    const decorations = new BoardDecorations({} as HTMLElement, () => {})
    const labelNodes = (decorations as unknown as { labelNodes: Map<string, HTMLElement> }).labelNodes
    labelNodes.set('label', node as unknown as HTMLElement)
    const board: Board = {
      title: 'Board',
      direction,
      items: [],
      labels: [{ id: 'label', text, x: 100, y: 40, width: 80, size: { width: 80, height: 20 } }],
      sections: [],
    }
    const unwrapped = withoutLabelWidth(board, 'label', { items: {}, labels: { label: { width: 80, height: 20 } } }, (label) =>
      decorations.labelShape(label, 1),
    )

    expect(unwrapped?.labels[0]?.x).toBe(expectedX)
    expect(decorations.labelShape(unwrapped?.labels[0] as BoardLabel, 1)).toEqual(naturalSize)
    expect(node.style.inlineSize).toBe('80px')
  })
})
