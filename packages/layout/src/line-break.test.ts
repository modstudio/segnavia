import { expect, test } from 'bun:test'
import type { Box, Glue, Penalty } from './line-break.ts'
import { breakLines } from './line-break.ts'

const box = (width: number): Box => ({ type: 'box', width })
const glue = (width = 1, stretch = 1, shrink = 1): Glue => ({ type: 'glue', width, stretch, shrink })
const penalty = (value: number, flagged = false, width = 0): Penalty => ({ type: 'penalty', width, penalty: value, flagged })

test("reproduces Knuth's published optimum-fit breaks with synthetic widths", () => {
  const publishedLines = [
    'In olden times when wishing still helped one, there lived a',
    'king whose daughters were all beautiful; and the youngest was',
    'so beautiful that the sun itself, which has seen so much, was',
  ]
  const words = publishedLines.flatMap((line) => line.split(' '))
  const items: Array<Box | Glue | Penalty> = words.flatMap((_, index) => (index === words.length - 1 ? [box(1)] : [box(1), glue()]))
  items.push(penalty(Number.POSITIVE_INFINITY), glue(0, 100_000, 0), penalty(Number.NEGATIVE_INFINITY))

  const result = breakLines(
    items,
    publishedLines.map((line) => line.split(' ').length * 2 - 1),
  )

  expect(result.breaks).toEqual([21, 41, 67])
  expect(result.ratios).toEqual([0, 0, 0])
  expect(result.violations).toEqual([false, false, false])
})

test('uses a forced penalty even when the resulting lines need emergency stretch', () => {
  const result = breakLines([box(3), penalty(Number.NEGATIVE_INFINITY), box(3), penalty(Number.NEGATIVE_INFINITY)], [10])

  expect(result.breaks).toEqual([1, 3])
  expect(result.violations).toEqual([false, false])
})

test('returns and flags the least-bad set when no feasible set exists', () => {
  const result = breakLines([box(15), penalty(Number.NEGATIVE_INFINITY)], [10])

  expect(result.breaks).toEqual([1])
  expect(result.ratios).toEqual([Number.NEGATIVE_INFINITY])
  expect(result.violations).toEqual([true])
})

test('chooses the least overflow when every set has a violation', () => {
  const result = breakLines([box(12), glue(1, 1, 0), box(1), penalty(Number.NEGATIVE_INFINITY)], [10])

  expect(result.breaks).toEqual([1, 3])
  expect(result.violations).toEqual([true, false])
})

test('does not hyphenate when an unhyphenated feasible set exists', () => {
  const items = [box(4), penalty(0, true, 1), box(1), glue(1, 2, 1), box(2), glue(), box(4), penalty(Number.NEGATIVE_INFINITY)]

  expect(breakLines(items, [8]).breaks).toEqual([3, 7])
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

test('chunks paragraphs above two thousand items at a legal breakpoint', () => {
  const items: Array<Box | Glue | Penalty> = Array.from({ length: 1_002 }, () => [box(1), glue(1, 10, 1)]).flat()
  items.push(box(1), penalty(Number.NEGATIVE_INFINITY))
  const result = breakLines(items, [100])

  expect(result.breaks).toContain(1_999)
  expect(result.breaks.at(-1)).toBe(items.length - 1)
})
