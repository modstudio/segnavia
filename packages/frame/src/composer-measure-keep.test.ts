import { describe, expect, test } from 'bun:test'
import {
  descendantKeepSignals,
  inlineLevelDisplay,
  type KeepSignalValues,
  keepSignals,
  type MeasuredKeepCandidate,
  measuredKeepRuns,
  skippableDescendantBoxDisplay,
} from './composer-measure.ts'

const lines = [
  { top: 0, bottom: 10 },
  { top: 10, bottom: 20 },
  { top: 20, bottom: 30 },
  { top: 30, bottom: 40 },
]

function candidate(extra: Partial<MeasuredKeepCandidate>): MeasuredKeepCandidate {
  return { top: 0, bottom: 10, avoidInside: false, keepWithNext: false, keepWithPrevious: false, ...extra }
}

function signalValues(extra: Partial<KeepSignalValues> = {}): KeepSignalValues {
  return {
    breakInside: 'auto',
    pageBreakInside: 'auto',
    breakAfter: 'auto',
    pageBreakAfter: 'auto',
    breakBefore: 'auto',
    pageBreakBefore: 'auto',
    keepWith: '',
    ...extra,
  }
}

describe('keep signals', () => {
  test('reads the three keep decisions from plain computed values', () => {
    expect(keepSignals(signalValues({ pageBreakInside: 'avoid', breakAfter: 'avoid', keepWith: 'previous' }))).toEqual({
      avoidInside: true,
      keepWithNext: true,
      keepWithPrevious: true,
    })
  })

  test('does not turn a block keep inherited by its children into descendant keeps', () => {
    const children = Array.from({ length: 3 }, () => descendantKeepSignals(signalValues({ keepWith: 'next' }), 'next'))
    expect(children).toEqual([
      { avoidInside: false, keepWithNext: false, keepWithPrevious: false },
      { avoidInside: false, keepWithNext: false, keepWithPrevious: false },
      { avoidInside: false, keepWithNext: false, keepWithPrevious: false },
    ])
  })

  test('keeps a child that changes its inherited keep direction', () => {
    expect(descendantKeepSignals(signalValues({ keepWith: 'previous' }), 'next')).toEqual({
      avoidInside: false,
      keepWithNext: false,
      keepWithPrevious: true,
    })
  })

  test('classifies every inline-level display by its first token', () => {
    expect(['inline', 'inline-block', 'inline-flex', 'inline-grid', 'inline-table', 'inline flow-root'].map(inlineLevelDisplay)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ])
    expect(inlineLevelDisplay('block')).toBe(false)
  })

  test('skips descendants that do not establish measurable block boxes', () => {
    expect(['none', 'contents', 'inline', 'inline flow-root', 'ruby', 'ruby-base', 'ruby-text'].map(skippableDescendantBoxDisplay)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ])
    expect(skippableDescendantBoxDisplay('block')).toBe(false)
  })
})

describe('measuredKeepRuns', () => {
  test('maps a list item with break-inside avoid to its line run', () => {
    expect(measuredKeepRuns(lines, [candidate({ top: 10, bottom: 30, avoidInside: true })])).toEqual({
      keepRuns: [{ start: 1, end: 3 }],
    })
  })

  test('keeps distinct nested descendant runs', () => {
    expect(measuredKeepRuns(lines, [candidate({ top: 0, bottom: 40, avoidInside: true }), candidate({ top: 10, bottom: 30, avoidInside: true })])).toEqual({
      keepRuns: [
        { start: 0, end: 4 },
        { start: 1, end: 3 },
      ],
    })
  })

  test('joins a nested keep-with-next heading to the following line', () => {
    expect(measuredKeepRuns(lines, [candidate({ top: 10, bottom: 20, keepWithNext: true })])).toEqual({
      keepRuns: [{ start: 1, end: 3 }],
    })
  })

  test('records the start of a keep-with-next heading on the last line', () => {
    expect(measuredKeepRuns(lines, [candidate({ top: 30, bottom: 40, keepWithNext: true })])).toEqual({
      keepRuns: [],
      keepWithNextFrom: 3,
    })
  })

  test('keeps a two-line tail heading together and records its start', () => {
    expect(measuredKeepRuns(lines, [candidate({ top: 20, bottom: 40, keepWithNext: true })])).toEqual({
      keepRuns: [{ start: 2, end: 4 }],
      keepWithNextFrom: 2,
    })
  })

  test('carries a keep-with-previous first child across the block edge', () => {
    expect(measuredKeepRuns(lines, [candidate({ keepWithPrevious: true })])).toEqual({
      keepRuns: [],
      keepWithPrevious: true,
    })
  })

  test('table row candidates retain their existing runs', () => {
    expect(measuredKeepRuns(lines, [candidate({ top: 0, bottom: 20, avoidInside: true }), candidate({ top: 20, bottom: 40, avoidInside: true })])).toEqual({
      keepRuns: [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
      ],
    })
  })
})
