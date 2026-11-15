export interface ParagraphToken {
  kind: 'text' | 'space' | 'atomic' | 'forced'
  text: string
  width: number
  node?: Text | Element
  start?: number
  end?: number
}

export interface ParagraphCompositionProfile {
  tokenMeasurementMs: number
  cacheHits: number
  rangeRects: number
  itemHyphenationMs: number
  breakLinesMs: number
  rewriteMs: number
  paragraphs: number
  tokens: number
  passes: Array<{ paragraphs: number; recomposed: number; tokens: number }>
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

export function inlineExtent(range: Range, writingMode: string): number {
  const rect = range.getBoundingClientRect()
  return writingMode.startsWith('vertical') ? rect.height : rect.width
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
  profile: ParagraphCompositionProfile,
): void {
  const styleKey = measurementStyleKey(node, styleFor)
  for (const part of graphemes(node.data)) {
    const range = doc.createRange()
    range.setStart(node, part.start)
    range.setEnd(node, part.end)
    const key = `${styleKey}|${part.text}`
    let width = cache.get(key)
    if (width === undefined) {
      profile.rangeRects += 1
      width = inlineExtent(range, writingMode)
      cache.set(key, width)
    } else profile.cacheHits += 1
    tokens.push({ kind: /^\s+$/u.test(part.text) ? 'space' : 'text', text: part.text, width, node, start: part.start, end: part.end })
  }
}

export function appendMeasuredTokens(
  parent: ParentNode,
  tokens: ParagraphToken[],
  cache: Map<string, number>,
  doc: Document,
  styleFor: typeof getComputedStyle,
  writingMode: string,
  profile: ParagraphCompositionProfile,
): void {
  for (const node of parent.childNodes) {
    if (node.nodeType === 3) {
      appendTextTokens(node as Text, tokens, cache, doc, styleFor, writingMode, profile)
      continue
    }
    if (node.nodeType !== 1) continue
    const element = node as Element
    if (element.matches('script,style,template,[data-segnavia-line]')) continue
    if (element.tagName === 'BR') tokens.push({ kind: 'forced', text: '', width: 0, node: element })
    else if (!element.textContent) {
      const rect = element.getBoundingClientRect()
      tokens.push({ kind: 'atomic', text: '', width: writingMode.startsWith('vertical') ? rect.height : rect.width, node: element })
    } else appendMeasuredTokens(element, tokens, cache, doc, styleFor, writingMode, profile)
  }
}

export function measuredTokens(
  paragraph: Element,
  cache: Map<string, number>,
  doc: Document,
  styleFor: typeof getComputedStyle,
  profile: ParagraphCompositionProfile,
): ParagraphToken[] {
  const writingMode = styleFor(paragraph).writingMode
  const tokens: ParagraphToken[] = []
  appendMeasuredTokens(paragraph, tokens, cache, doc, styleFor, writingMode, profile)
  return tokens
}

export function paragraphProfile(doc: Document): ParagraphCompositionProfile {
  const view = doc.defaultView as (Window & { __segnaviaParagraphCompositionProfile?: ParagraphCompositionProfile }) | null
  const held = view?.__segnaviaParagraphCompositionProfile
  if (held) return held
  const profile = {
    tokenMeasurementMs: 0,
    cacheHits: 0,
    rangeRects: 0,
    itemHyphenationMs: 0,
    breakLinesMs: 0,
    rewriteMs: 0,
    paragraphs: 0,
    tokens: 0,
    passes: [],
  }
  if (view) view.__segnaviaParagraphCompositionProfile = profile
  return profile
}
