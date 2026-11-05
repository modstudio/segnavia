import { expect, test } from 'bun:test'
import { railOrderMoves } from './rail-order.ts'

test('unchanged rail order needs no moves', () => {
  expect(railOrderMoves(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([])
})

test('a new rail item moves into each requested position', () => {
  expect(railOrderMoves(['a', 'b'], ['a', 'b', 'c'])).toEqual([{ id: 'c', before: null }])
  expect(railOrderMoves(['a', 'b'], ['c', 'a', 'b'])).toEqual([{ id: 'c', before: 'a' }])
  expect(railOrderMoves(['a', 'b'], ['a', 'c', 'b'])).toEqual([{ id: 'c', before: 'b' }])
})

test('a removed rail item needs no remaining item to move', () => {
  expect(railOrderMoves(['a', 'removed', 'b'], ['a', 'b'])).toEqual([])
})

test('swapping two rail items moves only one item', () => {
  expect(railOrderMoves(['a', 'b'], ['b', 'a'])).toEqual([{ id: 'a', before: null }])
})
