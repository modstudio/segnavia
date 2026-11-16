import { expect, test } from 'bun:test'
import { composeParagraphs, type ParagraphLine } from './composer-paragraph.ts'

const spacing = { minimum: 80, desired: 100, maximum: 120 }

function paragraph(text: string, width: () => number): Element {
  const held = {
    nodeType: 1,
    childElementCount: 0,
    childNodes: [] as Node[],
    textContent: text,
    getBoundingClientRect: () => ({ width: width(), height: 20 }),
    getAttribute: () => null,
    closest: () => null,
    querySelectorAll: () => [],
    hasAttribute: () => false,
    setAttribute: () => undefined,
    removeAttribute: () => undefined,
    append: () => undefined,
    replaceChildren(...children: Node[]) {
      this.childNodes = children
    },
  }
  held.childNodes = [{ nodeType: 3, data: text, parentElement: held, parentNode: held } as unknown as Text]
  return held as unknown as Element
}

function fakeDocument(): Document {
  const fragment = () => ({ append: () => undefined, querySelectorAll: () => [] })
  const element = () => ({
    nodeType: 1,
    style: { cssText: '' },
    setAttribute: () => undefined,
    append: () => undefined,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 1, height: 1 }),
    remove: () => undefined,
    cloneNode: () => element(),
  })
  return {
    documentElement: { lang: 'en' },
    createRange: () => ({
      setStart: () => undefined,
      setEnd: () => undefined,
      setStartBefore: () => undefined,
      setEndAfter: () => undefined,
      getBoundingClientRect: () => ({ width: 5, height: 10 }),
      cloneContents: fragment,
    }),
    createDocumentFragment: fragment,
    createTextNode: (data: string) => ({ data }),
    createElement: element,
  } as unknown as Document
}

function compose(
  paragraphs: Element[],
  composedParagraphs: WeakMap<Element, { children: Node[]; inlineSize: number }>,
  violations: Map<Element, { spacing: typeof spacing; violation: { line: number; ratio: number; wordSpacing: number } }>,
  linesFor: (measure: number) => ParagraphLine[],
): void {
  const style = {
    textAlign: 'justify',
    unicodeBidi: 'normal',
    direction: 'ltr',
    textIndent: '0px',
    writingMode: 'horizontal-tb',
    font: '16px serif',
    fontKerning: 'auto',
    fontFeatureSettings: 'normal',
    fontVariationSettings: 'normal',
    letterSpacing: 'normal',
    textTransform: 'none',
  } as CSSStyleDeclaration
  composeParagraphs(
    { querySelectorAll: () => paragraphs } as unknown as ParentNode,
    fakeDocument(),
    () => style,
    composedParagraphs,
    () => ({ composer: 'paragraph', hyphenate: false, wordSpacing: spacing }),
    (_tokens, settings) => linesFor(settings.measure),
    () => ({ breaks: [], ratios: [], violations: [] }),
    () => [],
    (rect) => rect.width,
    'data-identity',
    'data-continuation',
    'data-variable-value',
    violations,
  )
}

test('composeParagraphs records the worst violation and omits a clean paragraph', () => {
  const width = () => 40
  const violating = paragraph('aa', width)
  const clean = paragraph('bb', width)
  const violations = new Map()
  let calls = 0
  compose([violating, clean], new WeakMap(), violations, () => {
    calls++
    return calls === 1
      ? [
          { start: 0, end: 1, wordSpacing: -3, ratio: -1.5, hyphen: false, forced: false },
          { start: 1, end: 2, wordSpacing: 0, ratio: 0, hyphen: false, forced: false },
        ]
      : [
          { start: 0, end: 1, wordSpacing: 1, ratio: 0.5, hyphen: false, forced: false },
          { start: 1, end: 2, wordSpacing: 0, ratio: 0, hyphen: false, forced: false },
        ]
  })
  expect(violations.get(violating)).toEqual({ spacing, violation: { line: 0, ratio: -1.5, wordSpacing: 70 } })
  expect(violations.has(clean)).toBe(false)
})

test('composeParagraphs copies a violation to a reused paragraph', () => {
  const width = () => 40
  const first = paragraph('aa', width)
  const reused = paragraph('aa', width)
  const violations = new Map()
  let planned = 0
  compose([first, reused], new WeakMap(), violations, () => {
    planned++
    return [
      { start: 0, end: 1, wordSpacing: 3, ratio: 1.5, hyphen: false, forced: false },
      { start: 1, end: 2, wordSpacing: 0, ratio: 0, hyphen: false, forced: false },
    ]
  })
  expect(planned).toBe(1)
  expect(violations.get(reused)).toEqual({ spacing, violation: { line: 0, ratio: 1.5, wordSpacing: 130 } })
})

test('composeParagraphs drops an earlier violation when a changed measure sets cleanly', () => {
  let measure = 40
  const held = paragraph('aa', () => measure)
  const composedParagraphs = new WeakMap()
  const violations = new Map()
  const linesFor = (width: number): ParagraphLine[] => [
    { start: 0, end: 1, wordSpacing: width < 80 ? -3 : 1, ratio: width < 80 ? -1.5 : 0.5, hyphen: false, forced: false },
    { start: 1, end: 2, wordSpacing: 0, ratio: 0, hyphen: false, forced: false },
  ]
  compose([held], composedParagraphs, violations, linesFor)
  expect(violations.has(held)).toBe(true)
  measure = 100
  compose([held], composedParagraphs, violations, linesFor)
  expect(violations.has(held)).toBe(false)
})
