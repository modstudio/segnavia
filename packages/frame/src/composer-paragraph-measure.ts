import { logicalExtent } from './composer-axis-policy.ts'

export interface ParagraphToken {
  kind: 'text' | 'space' | 'atomic' | 'forced'
  text: string
  width: number
  node?: Text | Element
  start?: number
  end?: number
}

export function graphemes(text: string): { text: string; start: number; end: number }[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return [...segmenter.segment(text)].map((part) => ({ text: part.segment, start: part.index, end: part.index + part.segment.length }))
  }
  let index = 0
  return Array.from(text, (part) => {
    const held = { text: part, start: index, end: index + part.length }
    index += part.length
    return held
  })
}

export function measurementStyleKey(node: Text, styleFor: typeof getComputedStyle): string {
  const style = styleFor(node.parentElement ?? (node.parentNode as Element))
  return [style.font, style.fontKerning, style.fontFeatureSettings, style.fontVariationSettings, style.letterSpacing, style.textTransform].join('|')
}

export function appendTextTokens(
  node: Text,
  tokens: ParagraphToken[],
  cache: Map<string, number>,
  doc: Document,
  styleFor: typeof getComputedStyle,
  writingMode: string,
): void {
  const styleKey = measurementStyleKey(node, styleFor)
  for (const part of graphemes(node.data)) {
    const range = doc.createRange()
    range.setStart(node, part.start)
    range.setEnd(node, part.end)
    const key = `${writingMode}|${styleKey}|${part.text}`
    let width = cache.get(key)
    if (width === undefined) {
      width = logicalExtent(range.getBoundingClientRect(), writingMode, 'inline')
      cache.set(key, width)
    }
    const breakable = /^[ \t\n\f\r\u200b]+$/u.test(part.text)
    tokens.push({ kind: breakable ? 'space' : 'text', text: part.text, width: part.text === '\u200b' ? 0 : width, node, start: part.start, end: part.end })
  }
}

export function appendMeasuredTokens(
  parent: ParentNode,
  tokens: ParagraphToken[],
  cache: Map<string, number>,
  doc: Document,
  styleFor: typeof getComputedStyle,
  writingMode: string,
): void {
  for (const node of parent.childNodes) {
    if (node.nodeType === 3) {
      appendTextTokens(node as Text, tokens, cache, doc, styleFor, writingMode)
      continue
    }
    if (node.nodeType !== 1) continue
    const element = node as Element
    if (element.matches('script,style,template,[data-segnavia-line]')) continue
    if (element.tagName === 'BR') tokens.push({ kind: 'forced', text: '', width: 0, node: element })
    else if (!element.textContent) {
      tokens.push({ kind: 'atomic', text: '', width: logicalExtent(element.getBoundingClientRect(), writingMode, 'inline'), node: element })
    } else appendMeasuredTokens(element, tokens, cache, doc, styleFor, writingMode)
  }
}

export function measuredTokens(paragraph: Element, cache: Map<string, number>, doc: Document, styleFor: typeof getComputedStyle): ParagraphToken[] {
  const writingMode = styleFor(paragraph).writingMode
  const tokens: ParagraphToken[] = []
  appendMeasuredTokens(paragraph, tokens, cache, doc, styleFor, writingMode)
  return tokens
}
