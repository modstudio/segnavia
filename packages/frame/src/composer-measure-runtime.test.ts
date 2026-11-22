import { expect, test } from 'bun:test'
import { COMPOSER_SCRIPT, decideVisibleMeasurement } from './composer.ts'
import { measurementRefusal } from './composer-measure.ts'
import { embeddedComposerMeasureFunctions } from './composer-measure-embed.ts'

test('the embedded table measurement includes every helper it calls', () => {
  const cell = { querySelectorAll: () => [] }
  const row = {
    closest: () => table,
    getBoundingClientRect: () => ({ top: 10, bottom: 30 }),
    querySelectorAll: (selector: string) => (selector.startsWith(':scope') ? [cell] : []),
  }
  const table = {
    ownerDocument: { createTreeWalker: () => ({ nextNode: () => null }) },
    getBoundingClientRect: () => ({ top: 10, bottom: 30 }),
    querySelectorAll: (selector: string) => (selector === 'tr' ? [row] : []),
  }
  const rebuilt = new Function(`${embeddedComposerMeasureFunctions()}; return measureTableLines;`)() as (element: Element, origin: number) => unknown
  const originalStyle = globalThis.getComputedStyle
  const originalFilter = globalThis.NodeFilter
  globalThis.NodeFilter = { SHOW_TEXT: 4 } as typeof NodeFilter
  globalThis.getComputedStyle = (() => ({ borderCollapse: 'separate' })) as unknown as typeof getComputedStyle
  try {
    expect(rebuilt(table as unknown as Element, 0)).toEqual([{ top: 10, bottom: 30 }])
  } finally {
    globalThis.getComputedStyle = originalStyle
    globalThis.NodeFilter = originalFilter
  }
})

test('the repeated table header drops its block-start margin', () => {
  const placeHeader = COMPOSER_SCRIPT.slice(COMPOSER_SCRIPT.indexOf('var placeHeader='))
  const source = placeHeader.slice(0, placeHeader.indexOf('\nvar ', 1))
  expect(source).toContain('copyComputedStyle(table,held)')
  expect(source).toContain("held.style.marginBlockStart='0'")
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
