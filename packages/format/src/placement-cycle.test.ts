import { describe, expect, test } from 'bun:test'
import { checkPlacementCycles, findPlacementCycle } from './placement-cycle.ts'
import { PlacementRefusedError } from './placement-refusal.ts'

describe('placement cycles', () => {
  test('returns no chain for an acyclic graph', () => {
    expect(findPlacementCycle({ board: ['page', 'media'], page: ['media'], media: [] })).toBeUndefined()
    expect(() => checkPlacementCycles({ board: ['page'], page: [] })).not.toThrow()
  })

  test('finds a full cycle deterministically in insertion order', () => {
    expect(findPlacementCycle({ first: ['later'], later: ['last'], last: ['later'], other: ['other'] })).toEqual(['later', 'last', 'later'])
  })

  test('finds self-placement', () => {
    expect(findPlacementCycle({ page: ['page'] })).toEqual(['page', 'page'])
  })

  test('refuses with the full chain and the remedy', () => {
    expect(() => checkPlacementCycles({ a: ['b'], b: ['c'], c: ['a'] })).toThrow(PlacementRefusedError)
    expect(() => checkPlacementCycles({ a: ['b'], b: ['c'], c: ['a'] })).toThrow(
      'address could not be accepted because the placement chain a → b → c → a is a cycle; remove any one placement in the chain to clear this refusal',
    )
  })
})
