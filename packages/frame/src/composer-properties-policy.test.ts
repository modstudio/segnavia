import { expect, test } from 'bun:test'
import { logicalExtent } from './composer-axis-policy.ts'
import { measuredProperties, propertyCssValue } from './composer-properties-policy.ts'
import { runStageOnce } from './composer-stage-policy.ts'

test('a property stage reuses its first result on a retry', () => {
  const state = { done: false, results: [] as string[] }
  let calls = 0
  const run = () => runStageOnce(state, () => [`run-${++calls}`])
  expect(run()).toEqual(['run-1'])
  expect(run()).toEqual(['run-1'])
  expect(calls).toBe(1)
})

test('logical extents follow horizontal and vertical writing modes', () => {
  const rect = { width: 80, height: 30 }
  expect([logicalExtent(rect, 'horizontal-tb', 'inline'), logicalExtent(rect, 'horizontal-tb', 'block')]).toEqual([80, 30])
  expect([logicalExtent(rect, 'vertical-rl', 'inline'), logicalExtent(rect, 'vertical-rl', 'block')]).toEqual([30, 80])
})

test('property values carry CSS units and repeated block-name pairs are reduced', () => {
  expect(propertyCssValue({ value: 20.123456, unit: 'px' })).toBe('20.1235px')
  expect(propertyCssValue({ value: -1, unit: 'px' })).toBe('0px')
  expect(propertyCssValue({ value: 2, unit: '' })).toBe('2')
  expect(
    measuredProperties([
      { id: 'one', name: '--lines', kind: 'line-count', value: 2, unit: '' },
      { id: 'one', name: '--lines', kind: 'line-count', value: 3, unit: '' },
      { id: 'one', name: '--height', kind: 'block', value: 20, unit: 'px' },
    ]),
  ).toEqual([
    { id: 'one', name: '--lines', kind: 'line-count', value: 2, unit: '' },
    { id: 'one', name: '--height', kind: 'block', value: 20, unit: 'px' },
  ])
})
