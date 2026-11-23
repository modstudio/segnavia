import { expect, test } from 'bun:test'
import { boundRenderProgress, composeProgressReport, type RenderProgress, renderProgressReporter, renderProgressStages } from './progress.ts'

test('computes the ordered stages a render actually performs', () => {
  expect(renderProgressStages({ compose: true, set: true, finish: true })).toEqual(['compose', 'set', 'finish'])
  expect(renderProgressStages({ set: true, impose: true, finish: true })).toEqual(['set', 'impose', 'finish'])
  expect(renderProgressStages({ compose: true })).toEqual(['compose'])
})

test('bounds reports and holds a high-water per stage and input', () => {
  const reports: RenderProgress[] = []
  const reporter = renderProgressReporter({ report: (progress) => reports.push(progress) }, ['compose', 'set'])
  reporter.report('set', 1, 3, 0)
  reporter.report('set', 0, 3, 0)
  reporter.report('set', 1, 3, 1)
  reporter.report('set', 4, 3, 0)
  composeProgressReport(reporter, 0)?.({ pages: 2, total: 5 })
  expect(reports).toEqual([
    { stage: 'set', stages: ['compose', 'set'], done: 1, total: 3, input: 0 },
    { stage: 'set', stages: ['compose', 'set'], done: 1, total: 3, input: 1 },
    { stage: 'compose', stages: ['compose', 'set'], done: 2, total: 5, input: 0 },
  ])
})

test('reports growing totals without stepping done backward', () => {
  const reports: RenderProgress[] = []
  const reporter = renderProgressReporter({ report: (progress) => reports.push(progress) }, ['compose'])
  reporter.report('compose', 1, 1, 0)
  reporter.report('compose', 2, 3, 0)
  reporter.report('compose', 1, 4, 0)
  reporter.report('compose', 4, 4, 0)
  expect(reports.map(({ done, total }) => [done, total])).toEqual([
    [1, 1],
    [2, 3],
    [4, 4],
  ])
})

test('a progress option reused by sequential renders gets fresh high-water marks', () => {
  const reports: RenderProgress[] = []
  const options = { report: (progress: RenderProgress) => reports.push(progress) }
  renderProgressReporter(options, ['set']).report('set', 1, 1)
  renderProgressReporter(options, ['set']).report('set', 1, 1)
  expect(reports).toHaveLength(2)
})

test('rejects malformed progress at the render boundary', () => {
  expect(boundRenderProgress({ stage: 'set', stages: ['set'], done: 2, total: 1 })).toBeUndefined()
  expect(boundRenderProgress({ stage: 'set', stages: ['set', 'set'], done: 1, total: 1 })).toBeUndefined()
  expect(boundRenderProgress({ stage: 'press', stages: ['press'], done: 1, total: 1 })).toBeUndefined()
  expect(boundRenderProgress({ stage: 'set', stages: ['set'], done: 1, total: 1, input: 10_000 })).toBeUndefined()
})
