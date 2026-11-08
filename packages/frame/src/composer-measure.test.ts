import { describe, expect, test } from 'bun:test'
import { decideVisibleMeasurement } from './composer.ts'
import { measurementRefusal, tableRowLines } from './composer-measure.ts'

describe('tableRowLines', () => {
  test('a one-line row equals its row box', () => {
    expect(tableRowLines([{ top: 10, bottom: 30, boxes: [{ top: 14, bottom: 26 }] }])).toEqual([{ top: 10, bottom: 30 }])
  })

  test('interleaved lines from two cells merge into one set of row lines', () => {
    expect(
      tableRowLines([
        {
          top: 10,
          bottom: 70,
          boxes: [
            { top: 14, bottom: 24 },
            { top: 34, bottom: 44 },
            { top: 15, bottom: 25 },
            { top: 35, bottom: 45 },
          ],
        },
      ]),
    ).toEqual([
      { top: 10, bottom: 34 },
      { top: 34, bottom: 70 },
    ])
  })

  test('a three-line row tiles the row', () => {
    expect(
      tableRowLines([
        {
          top: 10,
          bottom: 70,
          boxes: [
            { top: 14, bottom: 24 },
            { top: 34, bottom: 44 },
            { top: 54, bottom: 64 },
          ],
        },
      ]),
    ).toEqual([
      { top: 10, bottom: 34 },
      { top: 34, bottom: 54 },
      { top: 54, bottom: 70 },
    ])
  })

  test('an empty row is one line', () => {
    expect(tableRowLines([{ top: 10, bottom: 30, boxes: [] }])).toEqual([{ top: 10, bottom: 30 }])
  })
})

test('an unmeasurable printed-page galley refuses with its own subject', () => {
  expect(measurementRefusal('The printed page', [])).toBe(
    'The printed page could not measure line boxes or plan a page because the frame or galley has no size, or layout stayed deferred; give the frame and galley a non-zero size or allow layout to finish to clear this refusal.',
  )
})

test('measurement time advances only while the galley has layout', () => {
  expect(decideVisibleMeasurement({ visibleElapsedMs: 900, frameElapsedMs: 200, hasLayout: false, measured: false }, 1_000)).toEqual({
    decision: 'retry',
    visibleElapsedMs: 900,
  })
  expect(decideVisibleMeasurement({ visibleElapsedMs: 900, frameElapsedMs: 200, hasLayout: true, measured: false }, 1_000)).toEqual({
    decision: 'refuse',
    visibleElapsedMs: 1_100,
  })
  expect(decideVisibleMeasurement({ visibleElapsedMs: 900, frameElapsedMs: 200, hasLayout: true, measured: true }, 1_000)).toEqual({
    decision: 'compose',
    visibleElapsedMs: 1_100,
  })
})
