import { expect, test } from 'bun:test'
import { measuredDecorationBoxes } from './composer-measure.ts'
import { measureTableLines } from './composer-table-measure.ts'

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
