import { expect, test } from 'bun:test'
import { COMPOSER_SCRIPT, decideVisibleMeasurement } from './composer.ts'
import { lineNumberedLines, measuredBlockConstraints, measureLineBoxes, measurementRefusal } from './composer-measure.ts'
import { embeddedComposerMeasureFunctions } from './composer-measure-embed.ts'

test('a display table element carries no orphan or widow constraint', () => {
  expect(measuredBlockConstraints('table', 2, 2)).toEqual({})
  expect(measuredBlockConstraints('block', 2, 3)).toEqual({ orphans: 2, widows: 3 })
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
    closest: () => null,
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
