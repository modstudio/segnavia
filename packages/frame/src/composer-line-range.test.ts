import { expect, test } from 'bun:test'
import { measureLineBoxes } from './composer-measure.ts'

test('a multi-line side-note descendant does not change its block lines', () => {
  const before = { top: 10, bottom: 20 }
  const after = { top: 50, bottom: 60 }
  const note = {}
  const document = (split: boolean) => ({
    createRange: () => {
      let part: 'all' | 'before' | 'after' = 'all'
      return {
        selectNodeContents: () => {},
        setStart: () => {},
        setEndBefore: () => {
          part = 'before'
        },
        setStartAfter: () => {
          part = 'after'
        },
        setEnd: () => {},
        getClientRects: () => {
          if (!split) return [before, after]
          if (part === 'before') return [before]
          if (part === 'after') return [after]
          return [before, { top: 20, bottom: 30 }, { top: 30, bottom: 40 }, { top: 40, bottom: 50 }, after]
        },
      }
    },
  })
  const element = (sideNote: boolean) => ({
    tagName: 'P',
    childNodes: sideNote ? [{}, note, {}] : [],
    ownerDocument: document(sideNote),
    querySelectorAll: (selector: string) => (sideNote && selector === '[data-side-note]' ? [note] : []),
    getBoundingClientRect: () => ({ top: 10, bottom: 60, height: 50 }),
  })
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureLineBoxes(element(true) as unknown as Element, 0)).toEqual(measureLineBoxes(element(false) as unknown as Element, 0))
  } finally {
    globalThis.getComputedStyle = original
  }
})
