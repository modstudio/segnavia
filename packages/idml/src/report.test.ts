import { expect, test } from 'bun:test'
import { ReportCollector } from './report.ts'

test('caps distinct link locations like other keyed report records', () => {
  const report = new ReportCollector()
  for (let index = 0; index < 7; index += 1) report.link('file:/art.ai', `spread#${index}`)
  expect(report.data().links).toEqual([{ uri: 'file:/art.ai', locations: ['spread#0', 'spread#1', 'spread#2', 'spread#3', 'spread#4'] }])
})
