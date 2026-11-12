import { expect, test } from 'bun:test'
import { graphemeInlineExtent } from './composer-properties.ts'

test('a direct child without text contributes its own logical inline box', () => {
  const previous = globalThis.NodeFilter
  Object.defineProperty(globalThis, 'NodeFilter', { configurable: true, value: { SHOW_TEXT: 4 } })
  try {
    const node = {
      nodeType: 1,
      ownerDocument: { createTreeWalker: () => ({ nextNode: () => null }) },
      getBoundingClientRect: () => ({ width: 72, height: 24 }),
    }
    expect(graphemeInlineExtent(node as unknown as Node, 'horizontal-tb')).toBe(72)
    expect(graphemeInlineExtent(node as unknown as Node, 'vertical-rl')).toBe(24)
  } finally {
    Object.defineProperty(globalThis, 'NodeFilter', { configurable: true, value: previous })
  }
})
