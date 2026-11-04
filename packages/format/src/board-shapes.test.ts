import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { BOARD_LABEL_ESTIMATE, type BoardItemFact, boardShapes, provisionalShape, resolvedShape } from './board-shapes.ts'

const board: Board = {
  title: 'Shapes',
  direction: 'rtl',
  items: [],
  labels: [
    { id: 'stored', text: 'Stored', x: 0, y: 0, size: { width: 60, height: 20 } },
    { id: 'measured', text: 'Measured', x: 0, y: 30 },
    { id: 'estimated', text: 'Estimate', x: 0, y: 60 },
  ],
  sections: [],
}

describe('boardShapes', () => {
  test('prefers a stored label size, then a measured size, then the documented estimate', () => {
    const measured: string[] = []
    const result = boardShapes(
      board,
      {},
      {
        measureLabel: (text, direction) => {
          measured.push(`${direction}:${text}`)
          return text === 'Measured' ? { width: 80, height: 21 } : undefined
        },
      },
    )
    expect(result.shapes.labels).toEqual({
      stored: { width: 60, height: 20 },
      measured: { width: 80, height: 21 },
      estimated: { width: 8 * BOARD_LABEL_ESTIMATE.widthPerCharacter, height: BOARD_LABEL_ESTIMATE.height },
    })
    expect(measured).toEqual(['ltr:Measured', 'ltr:Estimate'])
    expect(result.estimated).toEqual(['estimated'])
  })

  test('resolves each item kind and reports only missing facts as provisional', () => {
    const withItems: Board = {
      ...board,
      labels: [],
      items: [
        { id: 'deck', kind: 'deck', address: 'deck', x: 0, y: 0, width: 10 },
        { id: 'page', kind: 'page', address: 'page', x: 0, y: 0, width: 10 },
        { id: 'media', kind: 'media', address: 'media', x: 0, y: 0, width: 10 },
        { id: 'missing', kind: 'shot', address: 'missing', x: 0, y: 0, width: 10 },
      ],
    }
    const facts: Record<string, BoardItemFact> = {
      deck: { kind: 'deck', deck: { size: { width: 16, height: 10 } } },
      page: { kind: 'page', size: { width: 8, height: 11 } },
      media: { kind: 'media', width: 640, height: 480 },
    }
    expect(boardShapes(withItems, facts)).toEqual({
      shapes: {
        items: {
          deck: { width: 16, height: 10 },
          page: { width: 8, height: 11 },
          media: { width: 640, height: 480 },
          missing: provisionalShape('shot'),
        },
        labels: {},
      },
      provisional: ['missing'],
      estimated: [],
    })
  })

  test('maps every fact variant to its stated shape', () => {
    expect(resolvedShape({ kind: 'deck', deck: { size: { width: 16, height: 9 } } })).toEqual({ width: 16, height: 9 })
    expect(resolvedShape({ kind: 'page', size: { width: 8, height: 11 } })).toEqual({ width: 8, height: 11 })
    expect(resolvedShape({ kind: 'paper', size: { width: 11, height: 17 } })).toEqual({ width: 11, height: 17 })
    expect(resolvedShape({ kind: 'book', size: { width: 6, height: 9 } })).toEqual({ width: 6, height: 9 })
    expect(resolvedShape({ kind: 'media', width: 640, height: 480 })).toEqual({ width: 640, height: 480 })
    expect(resolvedShape({ kind: 'shot', width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 })
  })

  test('refuses a fact whose kind differs from the item', () => {
    const withItem: Board = { ...board, labels: [], items: [{ id: 'item', kind: 'deck', address: 'asset', x: 0, y: 0, width: 10 }] }
    expect(() => boardShapes(withItem, { asset: { kind: 'page', size: { width: 8, height: 11 } } })).toThrow(
      'board item "item" at "asset" has kind deck, but its resolved fact has kind page; provide a deck fact for that address',
    )
  })
})
