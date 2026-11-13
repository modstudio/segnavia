import { describe, expect, test } from 'bun:test'
import { COMPOSER_SCRIPT, decideVisibleMeasurement } from './composer.ts'
import { lineNumberedLines, measuredBlockConstraints, measureLineBoxes, measurementRefusal } from './composer-measure.ts'
import { embeddedComposerMeasureFunctions } from './composer-measure-embed.ts'
import { linesWithDescendantTables, linesWithTableHeaderHeights, repeatedTableHeaderIndexes, tableRowLines } from './composer-table-measure.ts'

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

  test('a nested table contributes its own row bands to the outer row', () => {
    expect(
      tableRowLines([
        {
          top: 10,
          bottom: 70,
          boxes: [{ top: 14, bottom: 24 }],
          tables: [
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
        },
      ]),
    ).toEqual([
      { top: 10, bottom: 30 },
      { top: 30, bottom: 50 },
      { top: 50, bottom: 70 },
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

const nestedHeaderFacts = [
  { top: 10, bottom: 100, height: 12, nesting: 0 },
  { top: 30, bottom: 80, height: 8, nesting: 1, parent: 0 },
]

test('a paragraph line in a mixed block reserves no table header', () => {
  expect(repeatedTableHeaderIndexes(nestedHeaderFacts, 5)).toEqual([])
  expect(linesWithTableHeaderHeights([{ top: 5, bottom: 10 }], nestedHeaderFacts)).toEqual([{ top: 5, bottom: 10 }])
})

test('a line inside only the outer table reserves its header', () => {
  expect(repeatedTableHeaderIndexes(nestedHeaderFacts, 20)).toEqual([0])
  expect(linesWithTableHeaderHeights([{ top: 20, bottom: 25 }], nestedHeaderFacts)).toEqual([{ top: 20, bottom: 25, headerHeight: 12 }])
})

test('a line inside a nested table reserves both headers outer first', () => {
  expect(repeatedTableHeaderIndexes(nestedHeaderFacts, 50)).toEqual([0, 1])
  expect(linesWithTableHeaderHeights([{ top: 50, bottom: 60 }], nestedHeaderFacts)).toEqual([{ top: 50, bottom: 60, headerHeight: 20 }])
})

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
    childNodes: [],
    ownerDocument: document,
    querySelectorAll: (selector: string) => (selector === 'table' ? (options.tables ?? []) : []),
    getBoundingClientRect: () => box,
  }
}

test('a hidden descendant table does not change its block lines', () => {
  const hiddenTable = {
    tagName: 'TABLE',
    parentElement: null,
    closest: () => null,
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
    closest: () => null,
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

test('a numbered container marks heading lines as uncounted while keeping paragraph lines counted', () => {
  const heading = { closest: () => null, getBoundingClientRect: () => ({ top: 10, bottom: 20 }) }
  const ranges = new Map<unknown, Array<{ top: number; bottom: number }>>([[heading, [{ top: 10, bottom: 20 }]]])
  let selected: unknown
  const element = {
    ownerDocument: {
      createRange: () => ({
        selectNodeContents: (candidate: unknown) => {
          selected = candidate
        },
        getClientRects: () => ranges.get(selected) ?? [],
      }),
    },
    querySelectorAll: () => [heading],
  }
  expect(
    lineNumberedLines(
      [
        { top: 10, bottom: 20 },
        { top: 20, bottom: 30 },
      ],
      element as unknown as Element,
      0,
    ),
  ).toEqual([
    { top: 10, bottom: 20, counted: false },
    { top: 20, bottom: 30 },
  ])
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
