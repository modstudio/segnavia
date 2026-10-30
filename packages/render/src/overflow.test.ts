import { describe, expect, test } from 'bun:test'
import {
  CHROMIUM_MAX_SHRINK,
  clippedHorizontalBox,
  horizontalOverflow,
  regionFitMinContribution,
  regionOverflowContribution,
  type ScaleMeasurement,
  solveScale,
} from './overflow.ts'

test('a region overflow mark becomes a page-and-region locator with its excess', () => {
  expect(regionOverflowContribution('12:reading-text:48')).toEqual({
    locator: 'page 12 region reading-text',
    clippedStart: 0,
    clippedEnd: 48,
  })
  expect(regionOverflowContribution('ג:table:3.5')).toEqual({
    locator: 'page ג region table',
    clippedStart: 0,
    clippedEnd: 3.5,
  })
})

test('a fit-min mark names the template, the region and the value, not a region locator', () => {
  expect(regionFitMinContribution('lesson:lesson-text:80pt')).toEqual({
    locator: 'template lesson region lesson-text data-fit-min 80pt',
    clippedStart: 0,
    clippedEnd: 0,
  })
  expect(regionOverflowContribution('12:reading-text:48').locator).not.toBe(regionFitMinContribution('12:reading-text:48').locator)
})

test('ancestor clip boxes limit the visible horizontal contribution', () => {
  expect(
    clippedHorizontalBox({ left: -20, right: 500 }, [
      { left: -10, right: 450 },
      { left: 0, right: 400 },
    ]),
  ).toEqual({ left: 0, right: 400 })
  expect(clippedHorizontalBox({ left: 420, right: 500 }, [{ left: 0, right: 400 }])).toBeUndefined()
})

test('an ancestor-clipped element is reported without raising the print scale', () => {
  expect(horizontalOverflow({ left: 360, right: 460 }, [{ left: 0, right: 400 }], 400, false)).toEqual({
    clippedStart: 0,
    clippedEnd: 60,
    rightOverflow: 0,
  })
})

test('overflow visible through an ancestor clip margin raises the print scale', () => {
  expect(horizontalOverflow({ left: 360, right: 460 }, [{ left: -100, right: 500 }], 400, false)).toEqual({
    clippedStart: 0,
    clippedEnd: 60,
    rightOverflow: 60,
  })
})

function solved(pageWidth: number, widthAt: (layoutWidth: number) => number): { scale: number; layouts: number[] } {
  const measurements: ScaleMeasurement[] = []
  const layouts: number[] = []
  while (true) {
    const decision = solveScale(pageWidth, measurements)
    if ('scale' in decision) return { scale: decision.scale, layouts }
    layouts.push(decision.measure)
    measurements.push({ layoutWidth: decision.measure, contentWidth: widthAt(decision.measure) })
  }
}

describe('print overflow solved scale', () => {
  test('keeps scale one without rightward overflow', () => {
    expect(solved(400, (layout) => layout)).toEqual({ scale: 1, layouts: [400] })
  })

  test('uses the exact Chromium cap for fixed overflow', () => {
    expect(solved(400, () => 1200).scale).toBe(CHROMIUM_MAX_SHRINK)
  })

  test('solves page-relative overflow', () => {
    expect(solved(400, (layout) => layout + 20).scale).toBeCloseTo(400 / 380)
  })

  test('solves mixed fixed and page-relative overflow', () => {
    const result = solved(400, (layout) => Math.max(500, layout + 120))
    expect(result.scale).toBe(CHROMIUM_MAX_SHRINK)
    expect(result.layouts.length).toBeLessThanOrEqual(Math.ceil(Math.log2(400)) + 2)
  })
})
