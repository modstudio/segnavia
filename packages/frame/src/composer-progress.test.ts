import { describe, expect, test } from 'bun:test'
import { COMPOSE_PROGRESS_YIELD_MS, decideProgressYield, reduceProgressHighWater } from './composer-progress.ts'

describe('compose progress policy', () => {
  test('yields after the work interval and always on the last page', () => {
    expect(decideProgressYield({ dressedSinceYield: 1, sinceYieldMs: COMPOSE_PROGRESS_YIELD_MS - 1, last: false })).toBe(false)
    expect(decideProgressYield({ dressedSinceYield: 1, sinceYieldMs: COMPOSE_PROGRESS_YIELD_MS, last: false })).toBe(true)
    expect(decideProgressYield({ dressedSinceYield: 1, sinceYieldMs: 0, last: true })).toBe(true)
  })

  test('holds the high-water mark across a repair pass', () => {
    let highWater = 0
    const reports = [1, 2, 3, 1, 2, 3].flatMap((pages) => {
      const report = reduceProgressHighWater(highWater, { pages, total: 3 })
      if (report) highWater = report.pages
      return report ? [report] : []
    })
    expect(reports.map((report) => report.pages)).toEqual([1, 2, 3])
  })
})
