import { expect, test } from 'bun:test'
import type { Box, Glue, Penalty } from './line-break.ts'
import { breakLines } from './line-break.ts'

const box = (width: number): Box => ({ type: 'box', width })
const glue = (width = 1, stretch = 1, shrink = 1): Glue => ({ type: 'glue', width, stretch, shrink })
const penalty = (value: number, flagged = false, width = 0): Penalty => ({ type: 'penalty', width, penalty: value, flagged })
const paragraph = (widths: readonly number[]): Array<Box | Glue | Penalty> => {
  const items: Array<Box | Glue | Penalty> = widths.flatMap((width, index) => (index === widths.length - 1 ? [box(width)] : [box(width), glue(1, 3, 1)]))
  items.push(penalty(Number.POSITIVE_INFINITY), glue(0, 100_000, 0), penalty(Number.NEGATIVE_INFINITY))
  return items
}

test('chooses a total-fit optimum for synthetic uneven word widths', () => {
  const items = paragraph([5, 4, 7, 6, 1, 8, 3, 2, 5])

  const result = breakLines(items, [13])

  // Greedy first-fit produces [3, 5, 9, 13, 19] for this measure.
  expect(result.breaks).toEqual([3, 7, 13, 19])
  expect(result.violations).toEqual([false, false, false, false])
})

test('uses a forced penalty even when the resulting lines need emergency stretch', () => {
  const result = breakLines([box(3), penalty(Number.NEGATIVE_INFINITY), box(3), penalty(Number.NEGATIVE_INFINITY)], [10], { emergencyStretch: 10 })

  expect(result.breaks).toEqual([1, 3])
  expect(result.ratios).toEqual([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY])
  expect(result.violations).toEqual([true, true])
})

test('returns and flags the least-bad set when no feasible set exists', () => {
  const result = breakLines([box(15), penalty(Number.NEGATIVE_INFINITY)], [10])

  expect(result.breaks).toEqual([1])
  expect(result.ratios).toEqual([Number.NEGATIVE_INFINITY])
  expect(result.violations).toEqual([true])
})

test('chooses the least overflow when every set has a violation', () => {
  const result = breakLines([box(12), glue(1, 1, 0), box(1), penalty(Number.NEGATIVE_INFINITY)], [10], { emergencyStretch: 10 })

  expect(result.breaks).toEqual([1, 3])
  expect(result.violations).toEqual([true, true])
})

test('does not hyphenate when an unhyphenated feasible set exists', () => {
  const items = [box(4), penalty(0, true, 1), box(1), glue(1, 2, 1), box(2), glue(), box(4), penalty(Number.NEGATIVE_INFINITY)]

  expect(breakLines(items, [8], { emergencyStretch: 8 }).breaks).toEqual([3, 7])
})

test('uses a flagged hyphen opportunity on the second pass', () => {
  const items = [box(7), penalty(0, true, 1), box(7), penalty(Number.POSITIVE_INFINITY), glue(0, 100_000, 0), penalty(Number.NEGATIVE_INFINITY)]
  const result = breakLines(items, [8])

  expect(result.breaks).toEqual([1, 5])
  expect(result.violations).toEqual([false, false])
})

test('charges extra demerits for consecutive flagged breaks', () => {
  const items = [
    box(2),
    glue(1, 8, 1),
    box(2),
    penalty(0, true, 1),
    box(4),
    glue(),
    box(1),
    glue(1, 4, 1),
    box(2),
    penalty(0, true, 1),
    box(9),
    penalty(Number.POSITIVE_INFINITY),
    glue(0, 100_000, 0),
    penalty(Number.NEGATIVE_INFINITY),
  ]

  expect(breakLines(items, [10], { flaggedDemerits: 0 }).breaks).toEqual([3, 9, 13])
  expect(breakLines(items, [10], { flaggedDemerits: 1_000_000 }).breaks).toEqual([5, 9, 13])
})

test('does not charge isolated flagged breaks as consecutive', () => {
  const items = [
    box(4),
    penalty(0, true, 2),
    box(5),
    penalty(0, true, 5),
    box(7),
    penalty(0, true, 5),
    box(7),
    glue(3, 4, 1),
    box(5),
    glue(2, 6, 1),
    box(3),
    penalty(0, true, 1),
    box(5),
    glue(3, 7, 1),
    box(6),
    penalty(Number.POSITIVE_INFINITY),
    glue(0, 100_000, 0),
    penalty(Number.NEGATIVE_INFINITY),
  ]

  expect(breakLines(items, [14], { flaggedDemerits: 1_000_000 }).breaks).toEqual([3, 7, 11, 17])
})

test('charges demerits for non-adjacent fitness classes', () => {
  const items = paragraph([4, 7, 6, 1, 8, 3, 2, 5])

  expect(breakLines(items, [14]).breaks).toEqual([3, 7, 11, 17])
  expect(breakLines(items, [14], { fitnessDemerits: 0 }).breaks).toEqual([3, 7, 13, 17])
})

test('uses the passed maximum ratio when reporting violations', () => {
  const items = [box(3), glue(1, 2, 1), box(3), penalty(Number.NEGATIVE_INFINITY)]

  expect(breakLines(items, [10]).violations).toEqual([false])
  expect(breakLines(items, [10], { maxRatio: 1 }).violations).toEqual([true])
})

test('chunks paragraphs above two thousand items at a legal breakpoint', () => {
  const items: Array<Box | Glue | Penalty> = Array.from({ length: 1_002 }, () => [box(1), glue(1, 10, 1)]).flat()
  items.push(box(1), penalty(Number.NEGATIVE_INFINITY))
  const result = breakLines(items, [100])

  expect(result.breaks).toContain(1_999)
  expect(result.breaks.at(-1)).toBe(items.length - 1)
})

test('does not invent a line at the two-thousand-item chunk boundary', () => {
  const items: Array<Box | Glue | Penalty> = Array.from({ length: 1_000 }, () => [box(1), glue()]).flat()
  items.push(penalty(Number.NEGATIVE_INFINITY))

  const result = breakLines(items, [20])

  expect(result.breaks.every((index) => index < items.length)).toBe(true)
  expect(result.ratios).toHaveLength(result.breaks.length)
  expect(result.violations).toHaveLength(result.breaks.length)
})
