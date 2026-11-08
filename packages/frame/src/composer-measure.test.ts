import { expect, test } from 'bun:test'
import { decideVisibleMeasurement } from './composer.ts'
import { measurementRefusal } from './composer-measure.ts'

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
