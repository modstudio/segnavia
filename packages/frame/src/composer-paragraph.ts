import { resolveDirection, textDirection } from '@segnavia/format'
import { readCompositionStyle } from '@segnavia/html'
import { breakLines, hyphenationPoints } from '@segnavia/layout'

export interface ParagraphToken {
  kind: 'text' | 'space'
  text: string
  width: number
  node?: Text
  start?: number
  end?: number
}

export interface ParagraphLine {
  start: number
  end: number
  wordSpacing: number
  hyphen: boolean
}

interface CompositionSettings {
  measure: number
  language: string
  hyphenate: boolean
  spacing: { minimum: number; desired: number; maximum: number }
}

interface BreakMeta {
  end: number
  next: number
  hyphen: boolean
}

type ParagraphItem =
  | { type: 'box'; width: number }
  | { type: 'glue'; width: number; stretch: number; shrink: number }
  | { type: 'penalty'; width: number; penalty: number; flagged: boolean }

const composedParagraphs = new WeakMap<Element, { children: Node[]; inlineSize: number }>()

function graphemes(text: string): { text: string; start: number; end: number }[] {
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

function textNodes(paragraph: Element, doc: Document, showText: number): Text[] {
  const nodes: Text[] = []
  const walker = doc.createTreeWalker(paragraph, showText)
  let node = walker.nextNode()
  while (node) {
    const parent = node.parentElement
    if (parent && !parent.closest('script,style,template,[data-segnavia-line]')) nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

function inlineExtent(range: Range, writingMode: string): number {
  const rect = range.getBoundingClientRect()
  return writingMode.startsWith('vertical') ? rect.height : rect.width
}

function measurementKey(node: Text, text: string, styleFor: typeof getComputedStyle): string {
  const style = styleFor(node.parentElement ?? (node.parentNode as Element))
  return [style.font, style.fontKerning, style.fontFeatureSettings, style.fontVariationSettings, style.letterSpacing, style.textTransform, text].join('|')
}

function measuredTokens(paragraph: Element, cache: Map<string, number>, doc: Document, styleFor: typeof getComputedStyle, showText: number): ParagraphToken[] {
  const writingMode = styleFor(paragraph).writingMode
  const tokens: ParagraphToken[] = []
  for (const node of textNodes(paragraph, doc, showText)) {
    for (const part of graphemes(node.data)) {
      const range = doc.createRange()
      range.setStart(node, part.start)
      range.setEnd(node, part.end)
      const key = measurementKey(node, part.text, styleFor)
      let width = cache.get(key)
      if (width === undefined) {
        width = inlineExtent(range, writingMode)
        cache.set(key, width)
      }
      tokens.push({ kind: /^\s+$/u.test(part.text) ? 'space' : 'text', text: part.text, width, node, start: part.start, end: part.end })
    }
  }
  return tokens
}

function hyphenWidth(paragraph: Element, doc: Document, styleFor: typeof getComputedStyle): number {
  const marker = doc.createElement('span')
  marker.textContent = '-'
  marker.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
  paragraph.append(marker)
  const writingMode = styleFor(paragraph).writingMode
  const rect = marker.getBoundingClientRect()
  marker.remove()
  return writingMode.startsWith('vertical') ? rect.height : rect.width
}

function wordRanges(tokens: readonly ParagraphToken[]): { start: number; end: number; text: string }[] {
  const words: { start: number; end: number; text: string }[] = []
  let start = 0
  while (start < tokens.length) {
    if (tokens[start]?.kind === 'space') {
      start++
      continue
    }
    let end = start + 1
    while (end < tokens.length && tokens[end]?.kind !== 'space') end++
    words.push({ start, end, text: tokens.slice(start, end).map((token) => token.text).join('') })
    start = end
  }
  return words
}

function tokenForOffset(tokens: readonly ParagraphToken[], start: number, point: number): number | undefined {
  let offset = 0
  for (let index = start; index < tokens.length && tokens[index]?.kind !== 'space'; index++) {
    offset += tokens[index]?.text.length ?? 0
    if (offset === point) return index
    if (offset > point) return undefined
  }
  return undefined
}

export function planParagraphLines(tokens: readonly ParagraphToken[], settings: CompositionSettings, markerWidth = 0): ParagraphLine[] {
  const { items, metadata } = paragraphItems(tokens, settings)
  addHyphenationItems(items, metadata, tokens, settings, markerWidth)
  return plannedLines(tokens, settings, items, metadata)
}

function paragraphItems(tokens: readonly ParagraphToken[], settings: CompositionSettings): { items: ParagraphItem[]; metadata: Map<number, BreakMeta> } {
  const items: ParagraphItem[] = []
  const metadata = new Map<number, BreakMeta>()
  const desired = settings.spacing.desired / 100
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token) continue
    if (token.kind === 'space') {
      const width = token.width * desired
      items.push({ type: 'glue', width, stretch: token.width * (settings.spacing.maximum / 100 - desired), shrink: token.width * (desired - settings.spacing.minimum / 100) })
      metadata.set(items.length - 1, { end: index, next: index + 1, hyphen: false })
    } else items.push({ type: 'box', width: token.width })
  }
  return { items, metadata }
}

function addHyphenationItems(items: ParagraphItem[], metadata: Map<number, BreakMeta>, tokens: readonly ParagraphToken[], settings: CompositionSettings, markerWidth: number): void {
  for (const word of wordRanges(tokens)) {
    for (const point of hyphenationPoints(word.text, settings.language)) {
      const tokenIndex = tokenForOffset(tokens, word.start, point)
      if (tokenIndex === undefined) continue
      const maqaf = word.text[point - 1] === '\u05be'
      if (!maqaf && !settings.hyphenate) continue
      let itemIndex = -1
      let seenTokens = 0
      for (let index = 0; index < items.length; index++) {
        if (items[index]?.type !== 'penalty') seenTokens++
        if (seenTokens === tokenIndex + 1) {
          itemIndex = index + 1
          break
        }
      }
      items.splice(itemIndex, 0, { type: 'penalty', width: maqaf ? 0 : markerWidth, penalty: 50, flagged: !maqaf })
      shiftMetadata(metadata, itemIndex)
      metadata.set(itemIndex, { end: tokenIndex + 1, next: tokenIndex + 1, hyphen: !maqaf })
    }
  }
}

function shiftMetadata(metadata: Map<number, BreakMeta>, itemIndex: number): void {
  for (const [key, value] of [...metadata.entries()].sort(([a], [b]) => b - a)) {
    if (key < itemIndex) continue
    metadata.delete(key)
    metadata.set(key + 1, value)
  }
}

function plannedLines(tokens: readonly ParagraphToken[], settings: CompositionSettings, items: readonly ParagraphItem[], metadata: ReadonlyMap<number, BreakMeta>): ParagraphLine[] {
  const broken = breakLines(items, [settings.measure])
  const lines: ParagraphLine[] = []
  let start = 0
  for (let lineIndex = 0; lineIndex < broken.breaks.length; lineIndex++) {
    const itemIndex = broken.breaks[lineIndex] ?? items.length
    const meta = metadata.get(itemIndex) ?? { end: tokens.length, next: tokens.length, hyphen: false }
    const ratio = broken.ratios[lineIndex] ?? 0
    const percent = ratio < 0 ? settings.spacing.desired + ratio * (settings.spacing.desired - settings.spacing.minimum) : settings.spacing.desired + ratio * (settings.spacing.maximum - settings.spacing.desired)
    const spaces = tokens.slice(start, meta.end).filter((token) => token.kind === 'space')
    const natural = spaces.length ? spaces.reduce((sum, token) => sum + token.width, 0) / spaces.length : 0
    lines.push({ start, end: meta.end, wordSpacing: natural === 0 || !Number.isFinite(percent) ? 0 : natural * (percent / 100 - 1), hyphen: meta.hyphen })
    start = meta.next
  }
  return lines
}

function lineFragment(tokens: readonly ParagraphToken[], line: ParagraphLine, doc: Document): DocumentFragment {
  const first = tokens[line.start]
  const last = tokens[line.end - 1]
  const fragment = doc.createDocumentFragment()
  if (!first?.node || first.start === undefined || !last?.node || last.end === undefined) return fragment
  const range = doc.createRange()
  range.setStart(first.node, first.start)
  range.setEnd(last.node, last.end)
  fragment.append(range.cloneContents())
  return fragment
}

function rewriteParagraph(paragraph: Element, tokens: readonly ParagraphToken[], lines: readonly ParagraphLine[], doc: Document): void {
  const fragments = lines.map((line) => lineFragment(tokens, line, doc))
  const direction = resolveDirection(paragraph.getAttribute('dir') as 'ltr' | 'rtl' | 'auto' | undefined, paragraph.getAttribute('lang') ?? doc.documentElement.lang, paragraph.textContent ?? '')
  const output = lines.map((line, index) => {
    const span = doc.createElement('span')
    span.setAttribute('data-segnavia-line', '')
    span.dir = direction
    span.style.display = 'block'
    span.style.textAlign = index === lines.length - 1 ? 'start' : 'justify'
    if (index < lines.length - 1) span.style.wordSpacing = `${line.wordSpacing}px`
    span.append(fragments[index] as DocumentFragment)
    if (line.hyphen) {
      const marker = doc.createElement('span')
      marker.setAttribute('data-segnavia-hyphen', '')
      marker.setAttribute('aria-hidden', 'true')
      marker.textContent = '-'
      span.append(marker)
    }
    return span
  })
  paragraph.replaceChildren(...output)
}

export function composeParagraphs(root: ParentNode, doc: Document, styleFor: typeof getComputedStyle, showText: number): void {
  const cache = new Map<string, number>()
  for (const paragraph of root.querySelectorAll('p')) {
    const rect = paragraph.getBoundingClientRect()
    const style = styleFor(paragraph)
    const inlineSize = style.writingMode.startsWith('vertical') ? rect.height : rect.width
    const previous = composedParagraphs.get(paragraph)
    if (previous && Math.abs(previous.inlineSize - inlineSize) <= 0.5) continue
    if (previous) paragraph.replaceChildren(...previous.children)
    const composition = readCompositionStyle(style)
    if (style.textAlign !== 'justify' || (composition.composer ?? 'paragraph') !== 'paragraph') continue
    const original = Array.from(paragraph.childNodes)
    const tokens = measuredTokens(paragraph, cache, doc, styleFor, showText)
    const lines = planParagraphLines(tokens, {
      measure: inlineSize,
      language: paragraph.getAttribute('lang') ?? doc.documentElement.lang,
      hyphenate: composition.hyphenate ?? true,
      spacing: composition.wordSpacing ?? { minimum: 80, desired: 100, maximum: 133 },
    }, hyphenWidth(paragraph, doc, styleFor))
    if (lines.length <= 1) continue
    composedParagraphs.set(paragraph, { children: original, inlineSize })
    rewriteParagraph(paragraph, tokens, lines, doc)
  }
}

/** Embeds paragraph composition after the shared layout and style functions. */
export function paragraphComposerScript(): string {
  return `var composedParagraphs=new WeakMap();
${textDirection.toString()}
${resolveDirection.toString()}
${graphemes.toString()}
${textNodes.toString()}
${inlineExtent.toString()}
${measurementKey.toString()}
${measuredTokens.toString()}
${hyphenWidth.toString()}
${wordRanges.toString()}
${tokenForOffset.toString()}
${paragraphItems.toString()}
${shiftMetadata.toString()}
${addHyphenationItems.toString()}
${plannedLines.toString()}
${planParagraphLines.toString()}
${lineFragment.toString()}
${rewriteParagraph.toString()}
${composeParagraphs.toString()}`
}
