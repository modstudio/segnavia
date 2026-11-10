import { describe, expect, test } from 'bun:test'
import { dressPlanPagesImplementation } from './composer-dress.ts'
import { COMPOSE_PROGRESS_YIELD_MS, composeProgressTotal, decideProgressYield, reduceProgressHighWater } from './composer-progress.ts'

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
    const pages = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(composeProgressTotal(pages, undefined)).toBe(7)
    expect(composeProgressTotal(pages, null)).toBe(7)
    expect(composeProgressTotal(pages, 4)).toBe(1)
    expect(composeProgressTotal(pages, 8)).toBe(0)
  })

  test('reports rising progress through a multi-page dress', async () => {
    const placed: number[] = []
    const reports: Array<{ pages: number; total: number }> = []
    const reportsAtYield: number[] = []
    let time = 0
    const step = Math.ceil(COMPOSE_PROGRESS_YIELD_MS / 2)
    const now = () => {
      const current = time
      time += step
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
    expect(reportsAtYield.length).toBeGreaterThan(1)
    expect(reports.every((progress, index) => index === 0 || progress.pages > (reports[index - 1]?.pages ?? 0))).toBe(true)
    expect(reports.at(-1)).toEqual({ pages: 6, total: 6 })
    expect(placed).toEqual([0, 1, 2, 3, 4, 5])
  })

  test.each([
    { name: 'a missing plan entry', pages: ['a', undefined, 'c'], only: undefined, placed: [0, 2], final: { pages: 2, total: 2 } },
    { name: 'an out-of-range selection', pages: ['a', 'b'], only: 3, placed: [], final: { pages: 0, total: 0 } },
  ])('ends at the count actually dressed for $name', async ({ pages, only, placed: expectedPlaced, final }) => {
    const placed: number[] = []
    const reports: Array<{ pages: number; total: number }> = []
    await dressPlanPagesImplementation(
      { pages },
      only,
      (progress) => reports.push(progress),
      (_pages, _page, index) => placed.push(index),
      () => ({ setAttribute: () => {} }),
      () => 0,
      async () => {},
    )
    expect(placed).toEqual([...expectedPlaced])
    expect(reports.at(-1)).toEqual(final)
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
