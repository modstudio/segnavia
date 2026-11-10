import { expect, test } from 'bun:test'
import type { ComputedBoardShapes } from '@segnavia/format'
import { copyComputedBoardShapes } from './board-shape-cache.ts'

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
