import { expect, test } from 'bun:test'
import { fillLimits, regionRefusal, runFillStageOnce, truncatedRegion } from './composer-fill-policy.ts'

test('runs fill once and reuses its first facts', () => {
  const state = { done: false, results: [] as number[] }
  expect(runFillStageOnce(state, () => [3])).toEqual([3])
  expect(runFillStageOnce(state, () => [9])).toEqual([3])
})

test('defaults and preserves validated repeat bounds', () => {
  expect(fillLimits(null, null)).toEqual({ min: 1, max: 10_000 })
  expect(fillLimits('2', '8')).toEqual({ min: 2, max: 8 })
})

test('bounds dropped ids while retaining total counts', () => {
  const result = truncatedRegion(
    'lesson:practice',
    Array.from({ length: 54 }, (_, index) => `row-${index}`),
    '7',
  )
  expect(result.fact).toMatchObject({ droppedPages: 0, droppedBlocks: 54, droppedTotal: 54 })
  expect(result.fact.droppedIds).toHaveLength(50)
  expect(result.entry.message).toContain('54 blocks')
})

test('region refusal names region, page and excess', () => {
  expect(regionRefusal('lesson:body', 'iv', 12.2)).toContain('lesson:body on page iv exceeds its block size by 13px')
})
