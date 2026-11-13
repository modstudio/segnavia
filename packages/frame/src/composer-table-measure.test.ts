import { describe, expect, test } from 'bun:test'
import { measuredDecorationBoxes } from './composer-measure.ts'
import {
  linesWithDescendantTables,
  linesWithTableHeaderHeights,
  measureTableLines,
  repeatedTableHeaderIndexes,
  stackedTableHeaders,
  tableRowLines,
} from './composer-table-measure.ts'

test('repeated table headers stack outer above inner at their own heights', () => {
  expect(stackedTableHeaders([0, 2], [{ height: 12 }, { height: 100 }, { height: 8 }], 30)).toEqual([
    { tableIndex: 0, top: 30, height: 12 },
    { tableIndex: 2, top: 42, height: 8 },
  ])
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

  test('sibling-cell text survives beside a nested table at the same heights', () => {
    expect(
      tableRowLines([
        {
          top: 10,
          bottom: 220,
          boxes: [
            { top: 90, bottom: 110 },
            { top: 140, bottom: 160 },
            { top: 190, bottom: 210 },
          ],
          tables: [
            {
              top: 100,
              bottom: 200,
              lines: [
                { top: 100, bottom: 150 },
                { top: 150, bottom: 200 },
              ],
            },
          ],
        },
      ]),
    ).toEqual([{ top: 10, bottom: 220 }])
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
  { top: 30, bottom: 80, height: 8, nesting: 1 },
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

test('a collapsed cell decoration starts after its shared block-start border', () => {
  const table = {}
  const cell = { tagName: 'TD', closest: () => table, getBoundingClientRect: () => ({ top: 10, bottom: 30 }) }
  const root = { tagName: 'DIV', querySelectorAll: () => [cell], getBoundingClientRect: () => ({ top: 0, bottom: 40 }) }
  const plain = {
    display: 'block',
    borderBlockStartWidth: '0px',
    borderBlockEndWidth: '0px',
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    boxShadow: 'none',
    outlineStyle: 'none',
    outlineWidth: '0px',
    outlineOffset: '0px',
  } as CSSStyleDeclaration
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = ((element: Element) =>
    (element === (table as unknown as Element)
      ? { borderCollapse: 'collapse' }
      : { ...plain, borderBlockStartWidth: '1px', borderBlockEndWidth: '1px' }) as unknown as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measuredDecorationBoxes(root as unknown as Element, 0, plain)[1]?.top).toBe(11.5)
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a collapsed border belongs to the preceding row band', () => {
  const cell = { querySelectorAll: () => [] }
  const rows = [
    {
      closest: () => table,
      getBoundingClientRect: () => ({ top: 10.5, bottom: 30 }),
      querySelectorAll: (selector: string) => (selector.startsWith(':scope') ? [cell] : []),
    },
    {
      closest: () => table,
      getBoundingClientRect: () => ({ top: 30, bottom: 49.5 }),
      querySelectorAll: (selector: string) => (selector.startsWith(':scope') ? [cell] : []),
    },
  ]
  const table = {
    ownerDocument: { createTreeWalker: () => ({ nextNode: () => null }) },
    getBoundingClientRect: () => ({ top: 10, bottom: 50 }),
    querySelectorAll: (selector: string) => (selector === 'tr' ? rows : []),
  }
  const original = globalThis.getComputedStyle
  const originalNodeFilter = globalThis.NodeFilter
  globalThis.NodeFilter = { SHOW_TEXT: 4 } as typeof NodeFilter
  globalThis.getComputedStyle = ((element: Element) =>
    (element === (table as unknown as Element)
      ? { borderCollapse: 'collapse' }
      : { borderBlockStartWidth: '1px', borderBlockEndWidth: '1px' }) as unknown as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureTableLines(table as unknown as Element, 0)).toEqual([
      { top: 10, bottom: 30, decorationBottom: 31.5 },
      { top: 31.5, bottom: 50 },
    ])
  } finally {
    globalThis.getComputedStyle = original
    globalThis.NodeFilter = originalNodeFilter
  }
})

test('a nested table is discovered and measured as row bands of its outer row', () => {
  const innerRows = [
    {
      closest: (selector: string) => (selector === 'table' ? innerTable : null),
      getBoundingClientRect: () => ({ top: 100, bottom: 150 }),
      querySelectorAll: () => [],
    },
    {
      closest: (selector: string) => (selector === 'table' ? innerTable : null),
      getBoundingClientRect: () => ({ top: 150, bottom: 200 }),
      querySelectorAll: () => [],
    },
  ]
  const outerCell = {
    closest: (selector: string) => (selector === 'table' ? outerTable : null),
    querySelectorAll: (selector: string) => (selector === 'table' ? [innerTable] : []),
  }
  const innerTable = {
    parentElement: outerCell,
    ownerDocument: { createTreeWalker: () => ({ nextNode: () => null }) },
    closest: () => null,
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ top: 100, bottom: 200 }),
    querySelectorAll: (selector: string) => (selector === 'tr' ? innerRows : []),
  }
  const outerRow = {
    closest: (selector: string) => (selector === 'table' ? outerTable : null),
    getBoundingClientRect: () => ({ top: 90, bottom: 210 }),
    querySelectorAll: (selector: string) => (selector.startsWith(':scope') ? [outerCell] : []),
  }
  const outerTable = {
    ownerDocument: { createTreeWalker: () => ({ nextNode: () => null }) },
    getBoundingClientRect: () => ({ top: 90, bottom: 210 }),
    querySelectorAll: (selector: string) => (selector === 'tr' ? [outerRow, ...innerRows] : []),
  }
  const originalStyle = globalThis.getComputedStyle
  const originalFilter = globalThis.NodeFilter
  globalThis.NodeFilter = { SHOW_TEXT: 4 } as typeof NodeFilter
  globalThis.getComputedStyle = (() =>
    ({ display: 'table', position: 'static', borderCollapse: 'separate' }) as unknown as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureTableLines(outerTable as unknown as Element, 0)).toEqual([
      { top: 90, bottom: 150 },
      { top: 150, bottom: 210 },
    ])
  } finally {
    globalThis.getComputedStyle = originalStyle
    globalThis.NodeFilter = originalFilter
  }
})
