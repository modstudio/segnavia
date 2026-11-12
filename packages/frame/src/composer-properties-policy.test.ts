import { expect, test } from 'bun:test'
import { logicalExtent, logicalLineCount, measuredProperties, propertyValue, runPropertyStageOnce } from './composer-properties-policy.ts'

test('a property stage reuses its first result on a retry', () => {
  const state = { done: false, results: [] as string[] }
  let calls = 0
  const run = () => runPropertyStageOnce(state, () => [`run-${++calls}`])
  expect(run()).toEqual(['run-1'])
  expect(run()).toEqual(['run-1'])
  expect(calls).toBe(1)
})

test('logical extents follow horizontal and vertical writing modes', () => {
  const rect = { width: 80, height: 30 }
  expect([logicalExtent(rect, 'horizontal-tb', 'inline'), logicalExtent(rect, 'horizontal-tb', 'block')]).toEqual([80, 30])
  expect([logicalExtent(rect, 'vertical-rl', 'inline'), logicalExtent(rect, 'vertical-rl', 'block')]).toEqual([30, 80])
})

test('line counting groups subpixel fragments on the logical block axis', () => {
  const rects = [
    { top: 10, left: 30, width: 10, height: 10 },
    { top: 10.2, left: 20, width: 10, height: 10 },
    { top: 25, left: 30, width: 10, height: 10 },
  ]
  expect(logicalLineCount(rects, 'horizontal-tb')).toBe(2)
  expect(logicalLineCount(rects, 'vertical-rl')).toBe(2)
})

test('property values carry CSS units and repeated block-name pairs are reduced', () => {
  expect(propertyValue('max-content-inline:children', 20.123456)).toBe('20.1235px')
  expect(propertyValue('block', -1)).toBe('0px')
  expect(propertyValue('line-count', 2)).toBe('2')
  expect(
    measuredProperties([
      { id: 'one', name: '--lines', value: '2' },
      { id: 'one', name: '--lines', value: '3' },
      { id: 'one', name: '--height', value: '20px' },
    ]),
  ).toEqual([
    { id: 'one', name: '--lines', value: '2' },
    { id: 'one', name: '--height', value: '20px' },
  ])
})
