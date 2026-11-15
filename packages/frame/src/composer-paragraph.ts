import { embedFunction, readCompositionStyle } from '@segnavia/html'
import { breakLines, hyphenationPoints } from '@segnavia/layout'

export interface ParagraphToken {
  kind: 'text' | 'space' | 'atomic' | 'forced'
  text: string
  width: number
  node?: Text | Element
  start?: number
  end?: number
}

export interface ParagraphLine {
  start: number
  end: number
  wordSpacing: number
  hyphen: boolean
  forced: boolean
}

interface CompositionSettings {
  measure: number
  language: string
  hyphenate: boolean
  indent?: number
  spacing: { minimum: number; desired: number; maximum: number }
}

interface BreakMeta {
  end: number
  next: number
  hyphen: boolean
  forced: boolean
}

type ParagraphItem =
  | { type: 'box'; width: number }
  | { type: 'glue'; width: number; stretch: number; shrink: number }
  | { type: 'penalty'; width: number; penalty: number; flagged: boolean }

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

function inlineExtent(range: Range, writingMode: string): number {
  const rect = range.getBoundingClientRect()
  return writingMode.startsWith('vertical') ? rect.height : rect.width
}

function measurementStyleKey(node: Text, styleFor: typeof getComputedStyle): string {
  const style = styleFor(node.parentElement ?? (node.parentNode as Element))
  return [style.font, style.fontKerning, style.fontFeatureSettings, style.fontVariationSettings, style.letterSpacing, style.textTransform].join('|')
}

function appendTextTokens(node: Text, tokens: ParagraphToken[], cache: Map<string, number>, doc: Document, styleFor: typeof getComputedStyle, writingMode: string): void {
  const styleKey = measurementStyleKey(node, styleFor)
  for (const part of graphemes(node.data)) {
    const range = doc.createRange()
    range.setStart(node, part.start)
    range.setEnd(node, part.end)
    const key = `${styleKey}|${part.text}`
    let width = cache.get(key)
    if (width === undefined) {
      width = inlineExtent(range, writingMode)
      cache.set(key, width)
    }
    tokens.push({ kind: /^\s+$/u.test(part.text) ? 'space' : 'text', text: part.text, width, node, start: part.start, end: part.end })
  }
}

function measuredTokens(paragraph: Element, cache: Map<string, number>, doc: Document, styleFor: typeof getComputedStyle, _showText: number): ParagraphToken[] {
  const writingMode = styleFor(paragraph).writingMode
  const tokens: ParagraphToken[] = []
  const visit = (parent: ParentNode): void => {
    for (const node of parent.childNodes) {
      if (node.nodeType === 3) {
        appendTextTokens(node as Text, tokens, cache, doc, styleFor, writingMode)
        continue
      }
      if (node.nodeType !== 1) continue
      const element = node as Element
      if (element.matches('script,style,template,[data-segnavia-line]')) continue
      if (element.tagName === 'BR') {
        tokens.push({ kind: 'forced', text: '', width: 0, node: element })
      } else if (!element.textContent) {
        const rect = element.getBoundingClientRect()
        tokens.push({ kind: 'atomic', text: '', width: writingMode.startsWith('vertical') ? rect.height : rect.width, node: element })
      } else visit(element)
    }
  }
  visit(paragraph)
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
    if (tokens[start]?.kind !== 'text') {
      start++
      continue
    }
    let end = start + 1
    while (end < tokens.length && tokens[end]?.kind === 'text') end++
    words.push({
      start,
      end,
      text: tokens
        .slice(start, end)
        .map((token) => token.text)
        .join(''),
    })
    start = end
  }
  return words
}

function tokenForOffset(tokens: readonly ParagraphToken[], start: number, point: number): number | undefined {
  let offset = 0
  for (let index = start; index < tokens.length && tokens[index]?.kind === 'text'; index++) {
    offset += tokens[index]?.text.length ?? 0
    if (offset === point) return index
    if (offset > point) return undefined
  }
  return undefined
}

export function planParagraphLines(tokens: readonly ParagraphToken[], settings: CompositionSettings, markerWidth = 0): ParagraphLine[] {
  return planParagraphLinesWith(tokens, settings, markerWidth, breakLines, hyphenationPoints)
}

function planParagraphLinesWith(
  tokens: readonly ParagraphToken[],
  settings: CompositionSettings,
  markerWidth: number,
  breakForLines: typeof breakLines,
  pointsForWord: typeof hyphenationPoints,
): ParagraphLine[] {
  const { items, metadata } = paragraphItems(tokens, settings)
  addHyphenationItems(items, metadata, tokens, settings, markerWidth, pointsForWord)
  return plannedLines(tokens, settings, items, metadata, breakForLines)
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
      items.push({
        type: 'glue',
        width,
        stretch: token.width * (settings.spacing.maximum / 100 - desired),
        shrink: token.width * (desired - settings.spacing.minimum / 100),
      })
      metadata.set(items.length - 1, { end: index, next: index + 1, hyphen: false, forced: false })
    } else if (token.kind === 'forced') {
      items.push({ type: 'penalty', width: 0, penalty: Number.NEGATIVE_INFINITY, flagged: false })
      metadata.set(items.length - 1, { end: index, next: index + 1, hyphen: false, forced: true })
    } else items.push({ type: 'box', width: token.width })
  }
  return { items, metadata }
}

function addHyphenationItems(
  items: ParagraphItem[],
  metadata: Map<number, BreakMeta>,
  tokens: readonly ParagraphToken[],
  settings: CompositionSettings,
  markerWidth: number,
  pointsForWord: typeof hyphenationPoints,
): void {
  for (const word of wordRanges(tokens)) {
    for (const point of pointsForWord(word.text, settings.language)) {
      addHyphenationPoint(items, metadata, tokens, settings, markerWidth, word, point)
    }
  }
}

function addHyphenationPoint(
  items: ParagraphItem[],
  metadata: Map<number, BreakMeta>,
  tokens: readonly ParagraphToken[],
  settings: CompositionSettings,
  markerWidth: number,
  word: { start: number; text: string },
  point: number,
): void {
  const tokenIndex = tokenForOffset(tokens, word.start, point)
  if (tokenIndex === undefined) return
  const maqaf = word.text[point - 1] === '\u05be'
  if (!maqaf && !settings.hyphenate) return
  let itemIndex = -1
  let seenTokens = 0
  for (let index = 0; index < items.length; index++) {
    if (items[index]?.type !== 'penalty') seenTokens++
    if (seenTokens !== tokenIndex + 1) continue
    itemIndex = index + 1
    break
  }
  items.splice(itemIndex, 0, { type: 'penalty', width: maqaf ? 0 : markerWidth, penalty: 50, flagged: !maqaf })
  shiftMetadata(metadata, itemIndex)
  metadata.set(itemIndex, { end: tokenIndex + 1, next: tokenIndex + 1, hyphen: !maqaf, forced: false })
}

function shiftMetadata(metadata: Map<number, BreakMeta>, itemIndex: number): void {
  for (const [key, value] of [...metadata.entries()].sort(([a], [b]) => b - a)) {
    if (key < itemIndex) continue
    metadata.delete(key)
    metadata.set(key + 1, value)
  }
}

function plannedLines(
  tokens: readonly ParagraphToken[],
  settings: CompositionSettings,
  items: readonly ParagraphItem[],
  metadata: ReadonlyMap<number, BreakMeta>,
  breakForLines: typeof breakLines,
): ParagraphLine[] {
  const broken = breakForLines(items, paragraphMeasures(settings.measure, settings.indent ?? 0))
  const lines: ParagraphLine[] = []
  let start = 0
  for (let lineIndex = 0; lineIndex < broken.breaks.length; lineIndex++) {
    const itemIndex = broken.breaks[lineIndex] ?? items.length
    const meta = metadata.get(itemIndex) ?? { end: tokens.length, next: tokens.length, hyphen: false, forced: false }
    const ratio = broken.ratios[lineIndex] ?? 0
    const percent =
      ratio < 0
        ? settings.spacing.desired + ratio * (settings.spacing.desired - settings.spacing.minimum)
        : settings.spacing.desired + ratio * (settings.spacing.maximum - settings.spacing.desired)
    const spaces = tokens.slice(start, meta.end).filter((token) => token.kind === 'space')
    const natural = spaces.length ? spaces.reduce((sum, token) => sum + token.width, 0) / spaces.length : 0
    lines.push({ start, end: meta.end, wordSpacing: natural === 0 || !Number.isFinite(percent) ? 0 : natural * (percent / 100 - 1), hyphen: meta.hyphen, forced: meta.forced })
    start = meta.next
  }
  return lines
}

export function paragraphMeasures(measure: number, indent: number): number[] {
  return [measure - indent, measure]
}

function setRangeStart(range: Range, token: ParagraphToken): void {
  if (token.node?.nodeType === 3 && token.start !== undefined) range.setStart(token.node, token.start)
  else if (token.node) range.setStartBefore(token.node)
}

function setRangeEnd(range: Range, token: ParagraphToken): void {
  if (token.node?.nodeType === 3 && token.end !== undefined) range.setEnd(token.node, token.end)
  else if (token.node) range.setEndAfter(token.node)
}

function lineFragment(tokens: readonly ParagraphToken[], line: ParagraphLine, doc: Document): DocumentFragment {
  const first = tokens[line.start]
  const last = tokens[line.end - 1]
  const fragment = doc.createDocumentFragment()
  if (!first?.node || !last?.node) return fragment
  const range = doc.createRange()
  setRangeStart(range, first)
  setRangeEnd(range, last)
  fragment.append(range.cloneContents())
  return fragment
}

export function removeContinuationIds(fragments: readonly ParentNode[]): void {
  const seen = new Set<string>()
  for (const fragment of fragments) {
    for (const element of fragment.querySelectorAll('[id]')) {
      const id = element.getAttribute('id') ?? ''
      if (seen.has(id)) element.removeAttribute('id')
      else seen.add(id)
    }
  }
}

function rewriteParagraph(paragraph: Element, tokens: readonly ParagraphToken[], lines: readonly ParagraphLine[], doc: Document, direction: string): void {
  const fragments = lines.map((line) => lineFragment(tokens, line, doc))
  removeContinuationIds(fragments)
  const output = lines.map((line, index) => {
    const span = doc.createElement('span')
    span.setAttribute('data-segnavia-line', '')
    span.dir = direction
    span.style.display = 'block'
    span.style.textAlign = index === lines.length - 1 || line.forced ? 'start' : 'justify'
    if (index > 0) span.style.textIndent = '0'
    if (index < lines.length - 1 && !line.forced) span.style.wordSpacing = `${line.wordSpacing}px`
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

export function contentInlineSize(rect: { width: number; height: number }, style: Pick<CSSStyleDeclaration, 'writingMode' | 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom' | 'borderLeftWidth' | 'borderRightWidth' | 'borderTopWidth' | 'borderBottomWidth'>): number {
  const vertical = style.writingMode.startsWith('vertical')
  const start = Number.parseFloat(vertical ? style.paddingTop : style.paddingLeft) || 0
  const end = Number.parseFloat(vertical ? style.paddingBottom : style.paddingRight) || 0
  const startBorder = Number.parseFloat(vertical ? style.borderTopWidth : style.borderLeftWidth) || 0
  const endBorder = Number.parseFloat(vertical ? style.borderBottomWidth : style.borderRightWidth) || 0
  return Math.max(0, (vertical ? rect.height : rect.width) - start - end - startBorder - endBorder)
}

function paragraphLanguage(paragraph: Element, doc: Document): string {
  return paragraph.closest('[lang]')?.getAttribute('lang') ?? doc.documentElement.lang
}

export function composeParagraphs(
  root: ParentNode,
  doc: Document,
  styleFor: typeof getComputedStyle,
  showText: number,
  composedParagraphs: WeakMap<Element, { children: Node[]; inlineSize: number }>,
  readStyle: typeof readCompositionStyle,
  planLines: typeof planParagraphLinesWith,
  breakForLines: typeof breakLines,
  pointsForWord: typeof hyphenationPoints,
): void {
  const cache = new Map<string, number>()
  for (const paragraph of root.querySelectorAll('p')) {
    const rect = paragraph.getBoundingClientRect()
    const style = styleFor(paragraph)
    const inlineSize = contentInlineSize(rect, style)
    const previous = composedParagraphs.get(paragraph)
    if (previous && Math.abs(previous.inlineSize - inlineSize) <= 0.5) continue
    if (previous) paragraph.replaceChildren(...previous.children)
    if (style.textAlign !== 'justify') continue
    const composition = readStyle(style)
    if ((composition.composer ?? 'paragraph') !== 'paragraph') continue
    const original = Array.from(paragraph.childNodes)
    const tokens = measuredTokens(paragraph, cache, doc, styleFor, showText)
    const lines = planLines(
      tokens,
      {
        measure: inlineSize,
        language: paragraphLanguage(paragraph, doc),
        hyphenate: composition.hyphenate ?? true,
        indent: Number.parseFloat(style.textIndent) || 0,
        spacing: composition.wordSpacing ?? { minimum: 80, desired: 100, maximum: 133 },
      },
      hyphenWidth(paragraph, doc, styleFor),
      breakForLines,
      pointsForWord,
    )
    if (lines.length <= 1) continue
    composedParagraphs.set(paragraph, { children: original, inlineSize })
    rewriteParagraph(paragraph, tokens, lines, doc, style.direction)
  }
}

/** Embeds paragraph composition after the shared layout and style functions. */
export function paragraphComposerScript(): string {
  return `var composedParagraphs=new WeakMap();
${embedFunction('graphemes', graphemes)}
${embedFunction('inlineExtent', inlineExtent)}
${embedFunction('measurementStyleKey', measurementStyleKey)}
${embedFunction('appendTextTokens', appendTextTokens)}
${embedFunction('measuredTokens', measuredTokens)}
${embedFunction('hyphenWidth', hyphenWidth)}
${embedFunction('wordRanges', wordRanges)}
${embedFunction('tokenForOffset', tokenForOffset)}
${embedFunction('paragraphItems', paragraphItems)}
${embedFunction('shiftMetadata', shiftMetadata)}
${embedFunction('addHyphenationPoint', addHyphenationPoint)}
${embedFunction('addHyphenationItems', addHyphenationItems)}
${embedFunction('plannedLines', plannedLines)}
${embedFunction('planParagraphLines', planParagraphLinesWith)}
${embedFunction('paragraphMeasures', paragraphMeasures)}
${embedFunction('setRangeStart', setRangeStart)}
${embedFunction('setRangeEnd', setRangeEnd)}
${embedFunction('lineFragment', lineFragment)}
${embedFunction('removeContinuationIds', removeContinuationIds)}
${embedFunction('rewriteParagraph', rewriteParagraph)}
${embedFunction('contentInlineSize', contentInlineSize)}
${embedFunction('paragraphLanguage', paragraphLanguage)}
${embedFunction('composeParagraphs', composeParagraphs)}`
}
