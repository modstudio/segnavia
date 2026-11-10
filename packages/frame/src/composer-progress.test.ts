import { describe, expect, test } from 'bun:test'
import {
  COMPOSE_PROGRESS_YIELD_MS,
  composeProgressTotal,
  decideProgressYield,
  dressPlanPagesImplementation,
  reduceProgressHighWater,
} from './composer-progress.ts'

describe('compose progress policy', () => {
  test('yields after the work interval and always on the last page', () => {
    expect(decideProgressYield({ sinceYieldMs: COMPOSE_PROGRESS_YIELD_MS - 1, last: false })).toBe(false)
    expect(decideProgressYield({ sinceYieldMs: COMPOSE_PROGRESS_YIELD_MS, last: false })).toBe(true)
    expect(decideProgressYield({ sinceYieldMs: 0, last: true })).toBe(true)
  })

  test('holds the high-water mark across a repair pass', () => {
    let highWater: { pages: number; total: number } | undefined
    const reports = [1, 2, 3, 1, 2, 3].flatMap((pages) => {
      const report = reduceProgressHighWater(highWater, { pages, total: 3 })
      if (report) highWater = report
      return report ? [report] : []
    })
    expect(reports.map((report) => report.pages)).toEqual([1, 2, 3])
  })

  test.each([
    [
      'fewer',
      [1, 2, 3],
      [1, 2],
      [
        { pages: 1, total: 3 },
        { pages: 2, total: 3 },
        { pages: 3, total: 3 },
        { pages: 2, total: 2 },
      ],
    ],
    [
      'more',
      [1, 2, 3],
      [1, 2, 3, 4, 5],
      [
        { pages: 1, total: 3 },
        { pages: 2, total: 3 },
        { pages: 3, total: 3 },
        { pages: 4, total: 5 },
        { pages: 5, total: 5 },
      ],
    ],
  ] as const)('resets the held mark safely when a repair has %s pages', (_name, first, second, expected) => {
    let highWater: { pages: number; total: number } | undefined
    const reports = [...first.map((pages) => ({ pages, total: first.length })), ...second.map((pages) => ({ pages, total: second.length }))].flatMap(
      (progress) => {
        const report = reduceProgressHighWater(highWater, progress)
        if (report) highWater = report
        return report ? [report] : []
      },
    )
    expect(reports).toEqual([...expected])
    expect(reports.at(-1)).toEqual({ pages: second.length, total: second.length })
  })

  test('counts one selected page and every page otherwise', () => {
    expect(composeProgressTotal(7, undefined)).toBe(7)
    expect(composeProgressTotal(7, null)).toBe(7)
    expect(composeProgressTotal(7, 4)).toBe(1)
  })

  test('catches omitted reports: 30 ms pages cross the 50 ms policy at 2, 4, and 6', async () => {
    const placed: number[] = []
    const reports: Array<{ pages: number; total: number }> = []
    const reportsAtYield: number[] = []
    let time = 0
    const now = () => {
      const current = time
      time += 30
      return current
    }
    await dressPlanPagesImplementation(
      { pages: ['a', 'b', 'c', 'd', 'e', 'f'] },
      undefined,
      (progress) => {
        reports.push(progress)
        reportsAtYield.push(placed.length)
      },
      (_pages, _page, index) => placed.push(index),
      () => ({ setAttribute: () => {} }),
      now,
      async () => {},
    )
    expect(COMPOSE_PROGRESS_YIELD_MS).toBe(50)
    expect(reportsAtYield).toEqual([2, 4, 6])
    expect(reports).toEqual([
      { pages: 2, total: 6 },
      { pages: 4, total: 6 },
      { pages: 6, total: 6 },
    ])
    expect(placed).toEqual([0, 1, 2, 3, 4, 5])
  })

  test('catches yielding without a report by pairing every report and task yield', async () => {
    let reports = 0
    let yields = 0
    await dressPlanPagesImplementation(
      { pages: ['a', 'b'] },
      undefined,
      () => {
        reports += 1
      },
      () => {},
      () => ({ setAttribute: () => {} }),
      () => 0,
      async () => {
        yields += 1
      },
    )
    expect(reports).toBe(1)
    expect(yields).toBe(reports)
  })

  test('catches an off-by-one only filter by placing the third page as index 2', async () => {
    const placed: Array<{ page: string; index: number }> = []
    const reports: Array<{ pages: number; total: number }> = []
    await dressPlanPagesImplementation(
      { pages: ['a', 'b', 'c', 'd'] },
      3,
      (progress) => reports.push(progress),
      (_pages, page, index) => placed.push({ page, index }),
      () => ({ setAttribute: () => {} }),
      () => 0,
      async () => {},
    )
    expect(placed).toEqual([{ page: 'c', index: 2 }])
    expect(reports).toEqual([{ pages: 1, total: 1 }])
  })
})
