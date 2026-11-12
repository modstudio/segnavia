import { expect, test } from 'bun:test'
import { fitSearch, reduceFitGroups } from './fit-search.ts'

test('searches strategies in author order and starts the next only at the prior bound', () => {
  const probes: Array<{ leading: number; size: number }> = []
  const result = fitSearch(
    [
      { strategy: 'leading', authored: 1.5, min: 1, step: 0.1 },
      { strategy: 'size', authored: 20, min: 10, step: 1 },
    ],
    (values) => {
      const leading = values.leading ?? Number.POSITIVE_INFINITY
      const size = values.size ?? Number.POSITIVE_INFINITY
      probes.push({ leading, size })
      return { fits: leading <= 1 && size <= 16, excess: Math.max(leading - 1, size - 16) }
    },
  )
  expect(result.values).toEqual(expect.objectContaining({ leading: 1, size: 16 }))
  expect(probes.find((probe) => probe.size < 20)?.leading).toBe(1)
})

test('reports the last exhausted bound and reduces every group strategy to its minimum', () => {
  expect(fitSearch([{ strategy: 'size', authored: 20, min: 12 }], () => ({ fits: false, excess: 4 }))).toEqual({
    values: { size: 12 },
    stopped: { strategy: 'size', bound: 12, excess: 4 },
  })
  const flashcards = Array.from({ length: 16 }, (_, index) => ({
    group: 'flashcards',
    values: { size: 28 - index, leading: 1.2 + index / 100 },
  }))
  const reduced = reduceFitGroups(flashcards)
  expect(reduced).toHaveLength(16)
  expect(reduced.every((card) => card.values.size === 13 && card.values.leading === 1.2)).toBe(true)
})
