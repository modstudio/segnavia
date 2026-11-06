import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { BOARD_LABEL_ESTIMATE, type BoardItemFact, boardShapes, labelShape, provisionalShape, resolvedShape } from './board-shapes.ts'

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
  test('reports whether a label shape was stored, measured or estimated', () => {
    expect(labelShape(board.labels[0] as Board['labels'][number])).toEqual({ shape: { width: 60, height: 20 }, source: 'stored' })
    expect(labelShape(board.labels[1] as Board['labels'][number], () => ({ width: 80, height: 21 }))).toEqual({
      shape: { width: 80, height: 21 },
      source: 'measured',
    })
    expect(labelShape(board.labels[2] as Board['labels'][number])).toEqual({
      shape: { width: 64, height: 19 },
      source: 'estimated',
    })
  })

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
      media: { kind: 'media', size: { width: 640, height: 480 } },
    }
    expect(boardShapes(withItems, facts)).toEqual({
      shapes: {
        items: {
          deck: { width: 16, height: 10 },
          page: { width: 8, height: 11 },
          media: { width: 640, height: 480 },
          missing: { width: 4, height: 3 },
        },
        labels: {},
      },
      provisional: ['missing'],
      estimated: [],
    })
  })

  test('uses one address fact for every item that shares the address', () => {
    const shared: Board = {
      ...board,
      labels: [],
      items: [
        { id: 'first', kind: 'page', address: 'shared', x: 0, y: 0, width: 10 },
        { id: 'second', kind: 'page', address: 'shared', x: 20, y: 0, width: 10 },
      ],
    }
    expect(boardShapes(shared, { shared: { kind: 'page', size: { width: 8, height: 11 } } }).shapes.items).toEqual({
      first: { width: 8, height: 11 },
      second: { width: 8, height: 11 },
    })
  })

  test('maps every fact variant to its stated shape', () => {
    expect(resolvedShape({ kind: 'deck', deck: { size: { width: 16, height: 9 } } })).toEqual({ width: 16, height: 9 })
    expect(resolvedShape({ kind: 'page', size: { width: 8, height: 11 } })).toEqual({ width: 8, height: 11 })
    expect(resolvedShape({ kind: 'paper', size: { width: 11, height: 17 } })).toEqual({ width: 11, height: 17 })
    expect(resolvedShape({ kind: 'book', size: { width: 6, height: 9 } })).toEqual({ width: 6, height: 9 })
    expect(resolvedShape({ kind: 'media', size: { width: 640, height: 480 } })).toEqual({ width: 640, height: 480 })
    expect(resolvedShape({ kind: 'shot', size: { width: 1280, height: 720 } })).toEqual({ width: 1280, height: 720 })
  })

  test('uses the documented provisional shape for every item kind', () => {
    expect(provisionalShape('deck')).toEqual({ width: 16, height: 9 })
    expect(provisionalShape('page')).toEqual({ width: 1, height: Math.SQRT2 })
    expect(provisionalShape('paper')).toEqual({ width: 1, height: Math.SQRT2 })
    expect(provisionalShape('book')).toEqual({ width: 1, height: Math.SQRT2 })
    expect(provisionalShape('media')).toEqual({ width: 4, height: 3 })
    expect(provisionalShape('shot')).toEqual({ width: 4, height: 3 })
  })

  test('refuses a fact whose kind differs from the item', () => {
    const withItem: Board = { ...board, labels: [], items: [{ id: 'item', kind: 'deck', address: 'asset', x: 0, y: 0, width: 10 }] }
    expect(() => boardShapes(withItem, { asset: { kind: 'page', size: { width: 8, height: 11 } } })).toThrow(
      'board item "item" at "asset" has kind deck, but its resolved fact has kind page; provide a deck fact for that address',
    )
  })
})
