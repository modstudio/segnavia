import { expect, test } from 'bun:test'
import { reportRenderProgress } from './progress.ts'

test('render progress re-bounds reports before calling the host', () => {
  const reports: unknown[] = []
  const report = (progress: { pages: number; total: number }) => reports.push(progress)
  reportRenderProgress({ pages: 2, total: 5 }, report)
  reportRenderProgress({ pages: -1, total: 5 }, report)
  reportRenderProgress({ pages: 6, total: 5 }, report)
  reportRenderProgress({ pages: 2.5, total: 5 }, report)
  reportRenderProgress({ pages: 2, total: 10_001 }, report)
  reportRenderProgress({ pages: '2', total: 5 }, report)
  expect(reports).toEqual([{ pages: 2, total: 5 }])
})
