import { expect, test } from 'bun:test'
import { logicalExtent } from './composer-axis-policy.ts'
import { inlineOverflowMeasurement } from './composer-inline-overflow.ts'

test('allows one pixel of inline overflow and reports two pixels', () => {
  expect(inlineOverflowMeasurement(101, 100)).toBeUndefined()
  expect(inlineOverflowMeasurement(102, 100)).toEqual({ extentMm: 27, columnWidthMm: 26.5, clippedMm: 0.5 })
})

test('reports the inline extent and clipped excess in millimeters', () => {
  expect(inlineOverflowMeasurement(412.3 * (96 / 25.4), 160 * (96 / 25.4))).toEqual({
    extentMm: 412.3,
    columnWidthMm: 160,
    clippedMm: 252.3,
  })
})

test('uses the logical inline axis in a vertical writing mode', () => {
  const rect = { width: 100, height: 202 }
  expect(inlineOverflowMeasurement(logicalExtent(rect, 'vertical-rl', 'inline'), 200)?.clippedMm).toBe(0.5)
  expect(inlineOverflowMeasurement(logicalExtent(rect, 'horizontal-tb', 'inline'), 200)).toBeUndefined()
})
