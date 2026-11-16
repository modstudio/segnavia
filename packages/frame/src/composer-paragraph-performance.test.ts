import { expect, test } from 'bun:test'
import { type ParagraphToken, planParagraphLinesWith } from './composer-paragraph.ts'
import { hyphenWidth, structuredParagraphReuseKey } from './composer-paragraph-performance.ts'

const settings = { measure: 32, language: 'en-US', hyphenate: true, spacing: { minimum: 80, desired: 100, maximum: 133 } }

test('returns a fitting line without invoking hyphenation or the breaker', () => {
  const unavailable = () => {
    throw new Error('a fitting paragraph does not need the breaker')
  }
  const tokens: ParagraphToken[] = Array.from('one', (text) => ({ kind: 'text', text, width: 5 }))
  expect(planParagraphLinesWith(tokens, settings, 0, unavailable, unavailable)).toEqual([{ start: 0, end: 3, wordSpacing: 0, hyphen: false, forced: false }])
})

test('measures a hyphen once for paragraphs with the same measured style', () => {
  let appended = 0
  const paragraph = { nodeType: 1, append: () => appended++ } as unknown as Element
  const marker = {
    style: { cssText: '' },
    textContent: '',
    getBoundingClientRect: () => ({ width: 4, height: 9 }),
    remove: () => undefined,
  }
  const doc = { createElement: () => marker } as unknown as Document
  const styleFor = () =>
    ({
      writingMode: 'horizontal-tb',
      font: '16px serif',
      fontKerning: 'auto',
      fontFeatureSettings: 'normal',
      fontVariationSettings: 'normal',
      letterSpacing: 'normal',
      textTransform: 'none',
    }) as CSSStyleDeclaration
  const widths = new Map<string, number>()
  expect([hyphenWidth(paragraph, doc, styleFor, widths), hyphenWidth(paragraph, doc, styleFor, widths)]).toEqual([4, 4])
  expect(appended).toBe(1)
})

test('reuses structured markup only with identical measured content', () => {
  const facts = [100, 'en', 'ltr']
  const paragraph = { innerHTML: '<a href="#note">note</a>' } as Element
  const token: ParagraphToken = { kind: 'text', text: 'n', width: 4 }
  const key = structuredParagraphReuseKey(paragraph, facts, [token])
  expect(structuredParagraphReuseKey({ innerHTML: paragraph.innerHTML } as Element, facts, [token])).toBe(key)
  expect(structuredParagraphReuseKey({ innerHTML: '<a href="#other">note</a>' } as Element, facts, [token])).not.toBe(key)
  expect(structuredParagraphReuseKey(paragraph, facts, [{ ...token, width: 5 }])).not.toBe(key)
})
