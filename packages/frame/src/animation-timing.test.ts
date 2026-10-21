import { expect, test } from 'bun:test'
import { animationReport } from './animation-timing.ts'

test('reports the longest finite animation end time', () => {
  expect(
    animationReport(
      [
        { endTime: 1200, iterations: 1 },
        { endTime: 3250, iterations: 3 },
      ],
      false,
    ),
  ).toEqual({ animated: true, lengthMs: 3250 })
})

test('reports unknown length for an infinite animation', () => {
  expect(animationReport([{ endTime: Infinity, iterations: Infinity }], false)).toEqual({ animated: true, lengthMs: null })
})

test('distinguishes static documents from canvas scenes', () => {
  expect(animationReport([], false)).toEqual({ animated: false, lengthMs: null })
  expect(animationReport([], true)).toEqual({ animated: true, lengthMs: null })
})
