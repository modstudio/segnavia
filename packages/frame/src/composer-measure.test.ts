import { describe, expect, test } from 'bun:test'
import { COMPOSER_SCRIPT, decideVisibleMeasurement } from './composer.ts'
import {
  descendantKeepSignals,
  headerHeightFor,
  inlineLevelDisplay,
  type KeepSignalValues,
  keepSignals,
  linesWithDescendantTables,
  type MeasuredKeepCandidate,
  measuredBlockConstraints,
  measuredKeepRuns,
  measureLineBoxes,
  measureTableLines,
  measurementRefusal,
  skippableDescendantBoxDisplay,
  tableRowLines,
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

test('a display table element carries no orphan or widow constraint', () => {
  expect(measuredBlockConstraints('table', 2, 2)).toEqual({})
  expect(measuredBlockConstraints('block', 2, 3)).toEqual({ orphans: 2, widows: 3 })
})

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

  test('the outer row bands include a collapsed table border', () => {
    const rows = [
      { closest: () => table, getBoundingClientRect: () => ({ top: 10.5, bottom: 30 }), querySelectorAll: () => [] },
      { closest: () => table, getBoundingClientRect: () => ({ top: 30, bottom: 49.5 }), querySelectorAll: () => [] },
    ]
    const table = {
      getBoundingClientRect: () => ({ top: 10, bottom: 50 }),
      querySelectorAll: (selector: string) => (selector === 'tr' ? rows : []),
    }
    expect(measureTableLines(table as unknown as Element, 0)).toEqual([
      { top: 10, bottom: 30 },
      { top: 30, bottom: 50 },
    ])
  })
})

test('a table inside a block replaces the range line spanning it with row bands', () => {
  expect(
    linesWithDescendantTables(
      [
        { top: 0, bottom: 10 },
        { top: 10, bottom: 70 },
        { top: 70, bottom: 80 },
      ],
      [
        {
          top: 10,
          bottom: 70,
          lines: [
            { top: 10, bottom: 30 },
            { top: 30, bottom: 50 },
            { top: 50, bottom: 70 },
          ],
        },
      ],
    ),
  ).toEqual([
    { top: 0, bottom: 10 },
    { top: 10, bottom: 30 },
    { top: 30, bottom: 50 },
    { top: 50, bottom: 70 },
    { top: 70, bottom: 80 },
  ])
})

test('only a block whose in-flow content is one table receives its header height', () => {
  const head = { getBoundingClientRect: () => ({ height: 18 }) }
  const table = { nodeType: 1, tagName: 'TABLE', tHead: head, getClientRects: () => [{}] }
  const whitespace = { nodeType: 3, textContent: ' \n ' }
  const paragraph = { nodeType: 1, tagName: 'P', getClientRects: () => [{}] }
  const wrapper = { tagName: 'DIV', childNodes: [whitespace, table] }
  const mixed = { tagName: 'DIV', childNodes: [paragraph, table] }
  const styleOf = () => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration

  expect(headerHeightFor(wrapper as unknown as Element, styleOf)).toBe(18)
  expect(headerHeightFor(mixed as unknown as Element, styleOf)).toBe(0)
})

test('the repeated table header drops its block-start margin', () => {
  const placeHeader = COMPOSER_SCRIPT.slice(COMPOSER_SCRIPT.indexOf('var placeHeader='))
  const source = placeHeader.slice(0, placeHeader.indexOf('\nvar ', 1))
  expect(source).toContain("held.style.marginBlockStart='0'")
})

function measuredElement(options: {
  tag?: string
  box?: { top: number; bottom: number; height: number }
  range?: Array<{ top: number; bottom: number }>
  tables?: unknown[]
}) {
  const box = options.box ?? { top: 10, bottom: 20, height: 10 }
  const document = {
    createRange: () => ({ selectNodeContents: () => {}, getClientRects: () => options.range ?? [] }),
  }
  return {
    tagName: options.tag ?? 'DIV',
    ownerDocument: document,
    querySelectorAll: (selector: string) => (selector === 'table' ? (options.tables ?? []) : []),
    getBoundingClientRect: () => box,
  }
}

test('a hidden descendant table does not change its block lines', () => {
  const hiddenTable = {
    tagName: 'TABLE',
    parentElement: null,
    getClientRects: () => [],
  }
  const plain = measuredElement({ range: [{ top: 12, bottom: 18 }] })
  const withHiddenTable = measuredElement({ range: [{ top: 12, bottom: 18 }], tables: [hiddenTable] })
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = ((element: Element) =>
    ({ display: element === (hiddenTable as unknown as Element) ? 'none' : 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureLineBoxes(withHiddenTable as unknown as Element, 0)).toEqual(measureLineBoxes(plain as unknown as Element, 0))
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a figure without an in-flow table keeps its replaced box', () => {
  const figure = measuredElement({ tag: 'FIGURE', box: { top: 10, bottom: 80, height: 70 } })
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureLineBoxes(figure as unknown as Element, 0)).toEqual([{ top: 10, bottom: 80 }])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a figure with an in-flow table uses the table row bands', () => {
  const row = {
    closest: () => table,
    getBoundingClientRect: () => ({ top: 20, bottom: 60 }),
    querySelectorAll: () => [],
  }
  const table = {
    tagName: 'TABLE',
    parentElement: null as unknown,
    ownerDocument: {},
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ top: 20, bottom: 60 }),
    querySelectorAll: (selector: string) => (selector === 'tr' ? [row] : []),
  }
  const figure = measuredElement({ tag: 'FIGURE', box: { top: 10, bottom: 80, height: 70 }, range: [{ top: 20, bottom: 60 }], tables: [table] })
  table.parentElement = figure
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureLineBoxes(figure as unknown as Element, 0)).toEqual([{ top: 20, bottom: 60 }])
  } finally {
    globalThis.getComputedStyle = original
  }
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
