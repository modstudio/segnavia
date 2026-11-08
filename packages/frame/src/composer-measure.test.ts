import { expect, test } from 'bun:test'
import { decideBookMeasurement } from './composer.ts'
import { measurementRefusal } from './composer-measure.ts'

test('an unmeasurable printed-page galley refuses with its own subject', () => {
  expect(decideBookMeasurement({ hasLayout: false, flows: [], plannedPages: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
  expect(measurementRefusal('The printed page', [])).toBe(
    'The printed page could not measure line boxes or plan a page because the frame or galley has no size, or layout stayed deferred; give the frame and galley a non-zero size or allow layout to finish to clear this refusal.',
  )
})
