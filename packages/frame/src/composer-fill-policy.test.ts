import { expect, test } from 'bun:test'
import { fillLimits, lastLineStart, mergeRegionFact, recordTruncatedRegion, regionRefusal, runFillStageOnce, truncatedRegion } from './composer-fill-policy.ts'

test('runs fill once and reuses its first facts', () => {
  const state = { done: false, results: [] as number[] }
  expect(runFillStageOnce(state, () => [3])).toEqual([3])
  expect(runFillStageOnce(state, () => [9])).toEqual([3])
})

test('defaults and preserves validated repeat bounds', () => {
  expect(fillLimits(null, null)).toEqual({ min: 1, max: 10_000 })
  expect(fillLimits('2', '8')).toEqual({ min: 2, max: 8 })
  expect(() => fillLimits('0', '8')).toThrow('data-fill-min')
  expect(() => fillLimits('1', '0')).toThrow('data-fill-max')
  expect(() => fillLimits('1', '10001')).toThrow('no greater than 10000')
})

test('bounds dropped ids while retaining total counts', () => {
  const result = truncatedRegion(
    'lesson:practice',
    Array.from({ length: 54 }, (_, index) => `row-${index}`),
    '7',
  )
  expect(result.fact).toMatchObject({ droppedPages: 1, droppedBlocks: 54, droppedTotal: 54 })
  expect(result.fact.droppedIds).toHaveLength(50)
  expect(result.entry.message).toContain('54 blocks')
  expect(result.entry.message).toContain('data-overflow="grow" to clear it')
})

test('merges copies and truncation into one fact per subject with the smallest fill count', () => {
  const facts: import('@segnavia/format').PreflightRegion[] = []
  mergeRegionFact(facts, { subject: 'lesson:practice', fillCount: 7 })
  mergeRegionFact(facts, { subject: 'lesson:practice', fillCount: 5 })
  mergeRegionFact(facts, { subject: 'lesson:practice', droppedPages: 1, droppedBlocks: 2, droppedIds: ['a', 'b'], droppedTotal: 2 })
  expect(facts).toEqual([{ subject: 'lesson:practice', fillCount: 5, droppedPages: 1, droppedBlocks: 2, droppedIds: ['a', 'b'], droppedTotal: 2 }])
})

test('finds the first grapheme on the trailing line', () => {
  expect(lastLineStart([10, 10, 24, 24, 24])).toBe(2)
  expect(lastLineStart([10, 10])).toBe(0)
  expect(lastLineStart([])).toBe(-1)
})

test('aggregates dropped page copies and blocks by region subject', () => {
  const entries: import('@segnavia/format').PreflightEntry[] = []
  const facts: import('@segnavia/format').PreflightRegion[] = []
  recordTruncatedRegion('lesson:practice', ['first', 'second'], '2', entries, facts)
  recordTruncatedRegion('lesson:practice', ['third'], '3', entries, facts)
  expect(facts).toEqual([{ subject: 'lesson:practice', droppedPages: 2, droppedBlocks: 3, droppedIds: ['first', 'second', 'third'], droppedTotal: 3 }])
  expect(entries).toHaveLength(1)
  expect(entries[0]?.message).toContain('2 pages; 3 blocks')
})

test('keeps fill and truncation on one region record', () => {
  const entries: import('@segnavia/format').PreflightEntry[] = []
  const facts: import('@segnavia/format').PreflightRegion[] = [{ subject: 'lesson:practice', fillCount: 4 }]
  recordTruncatedRegion('lesson:practice', ['last'], '2', entries, facts)
  expect(facts).toEqual([{ subject: 'lesson:practice', fillCount: 4, droppedPages: 1, droppedBlocks: 1, droppedIds: ['last'], droppedTotal: 1 }])
})

test('region refusal names region, page and excess', () => {
  expect(regionRefusal('lesson:body', 'iv', 12.2)).toContain('lesson:body on page iv exceeds its block size by 13px')
})
