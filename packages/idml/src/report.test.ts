import { expect, test } from 'bun:test'
import { ReportCollector } from './report.ts'

test('caps distinct link locations like other keyed report records', () => {
  const report = new ReportCollector()
  for (let index = 0; index < 7; index += 1) report.link('file:/art.ai', `spread#${index}`)
  expect(report.data().links).toEqual([{ uri: 'file:/art.ai', locations: ['spread#0', 'spread#1', 'spread#2', 'spread#3', 'spread#4'] }])
})

test('lists every distinct unmapped object style in deterministic order', () => {
  const report = new ReportCollector()
  for (const style of ['Style 7', 'Style 2', 'Style 4', 'Style 1', 'Style 6', 'Style 3', 'Style 5', 'Style 2']) {
    report.unmappedFeature('objectStyle', style)
  }
  expect(report.data().unmappedFeatures.objectStyle).toEqual(['Style 1', 'Style 2', 'Style 3', 'Style 4', 'Style 5', 'Style 6', 'Style 7'])
})
