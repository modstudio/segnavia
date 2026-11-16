import { expect, test } from 'bun:test'
import type { Board, ComputedBoardShapes } from '@segnavia/format'
import { BoardShapeCache, copyComputedBoardShapes } from './board-shape-cache.ts'

test('a computed shapes copy cannot mutate the cached geometry', () => {
  const cached: ComputedBoardShapes = {
    shapes: { items: { item: { width: 100, height: 60 } }, labels: { label: { width: 40, height: 20 } } },
    provisional: ['item'],
    estimated: ['label'],
  }
  const exposed = copyComputedBoardShapes(cached)
  exposed.shapes.items.item = { width: 1, height: 1 }
  exposed.shapes.labels.label = { width: 2, height: 2 }
  exposed.provisional.push('other')
  exposed.estimated.length = 0
  expect(copyComputedBoardShapes(cached)).toEqual({
    shapes: { items: { item: { width: 100, height: 60 } }, labels: { label: { width: 40, height: 20 } } },
    provisional: ['item'],
    estimated: ['label'],
  })
})

test('updates facts from sized unavailable outcomes and omits unsettled outcomes', () => {
  const board = {
    items: [{ id: 'paper', kind: 'paper', address: 'paper', x: 0, y: 0, width: 100 }],
    labels: [],
    sections: [],
  } as unknown as Board
  const computed: ComputedBoardShapes = { shapes: { items: {}, labels: {} }, provisional: [], estimated: [] }
  const cache = new BoardShapeCache({ shapes: () => computed } as never)

  cache.update(board, () => ({ status: 'unavailable', value: { kind: 'paper', state: 'withheld', size: { width: 10, height: 20 } } }), 1)
  expect(cache.facts).toEqual({ paper: { kind: 'paper', size: { width: 10, height: 20 } } })

  cache.update(board, () => ({ status: 'pending' }), 1)
  expect(cache.facts).toEqual({})
  cache.update(board, () => ({ status: 'failed' }), 1)
  expect(cache.facts).toEqual({})
})
