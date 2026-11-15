import { embedFunction, type readCompositionStyle } from '@segnavia/html'
import { breakLines, hyphenationPoints } from '@segnavia/layout'
import { contentInlineSize } from './composer-paragraph-box.ts'
import {
  COMPOSITION_CONTINUATION_ATTRIBUTE,
  COMPOSITION_IDENTITY_ATTRIBUTE,
  COMPOSITION_VARIABLE_VALUE_ATTRIBUTE,
  correctedWordSpacing,
  fitLineToMeasure,
  lineFragment,
  markCompositionContinuations,
  markCompositionIdentities,
  removeContinuationIds,
  rewriteParagraph,
  setRangeEnd,
  setRangeStart,
} from './composer-paragraph-dom.ts'
import {
  appendMeasuredTokens,
  appendTextTokens,
  graphemes,
  inlineExtent,
  measuredTokens,
  measurementStyleKey,
  type ParagraphCompositionProfile,
  type ParagraphToken,
  paragraphProfile,
} from './composer-paragraph-measure.ts'

export type { ParagraphToken } from './composer-paragraph-measure.ts'
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
  profile?: ParagraphCompositionProfile,
  now: () => number = () => performance.now(),
): ParagraphLine[] {
  const itemsStarted = now()
  const { items, metadata, tokenItems } = paragraphItems(tokens, settings)
  addHyphenationItems(items, metadata, tokenItems, tokens, settings, markerWidth, pointsForWord)
  if (profile) profile.itemHyphenationMs += now() - itemsStarted
  const timedBreak: typeof breakLines = (source, measures) => {
    const started = now()
    const result = breakForLines(source, measures)
    if (profile) profile.breakLinesMs += now() - started
    return result
  }
  return plannedLines(tokens, settings, items, metadata, timedBreak)
}
function paragraphItems(
  tokens: readonly ParagraphToken[],
  settings: CompositionSettings,
): { items: ParagraphItem[]; metadata: Map<number, BreakMeta>; tokenItems: number[] } {
  const items: ParagraphItem[] = []
  const metadata = new Map<number, BreakMeta>()
  const tokenItems: number[] = []
  const desired = settings.spacing.desired / 100
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token) continue
    tokenItems[index] = items.length
    if (token.kind === 'space') {
      const width = token.width * desired
      items.push({
        type: 'glue',
        width,
        stretch: token.width * (settings.spacing.maximum / 100 - desired),
        shrink: token.width * (desired - settings.spacing.minimum / 100),
      })
      metadata.set(items.length - 1, { end: index + 1, next: index + 1, hyphen: false, forced: false })
    } else if (token.kind === 'forced') {
      items.push({ type: 'penalty', width: 0, penalty: Number.NEGATIVE_INFINITY, flagged: false })
      metadata.set(items.length - 1, { end: index, next: index + 1, hyphen: false, forced: true })
    } else items.push({ type: 'box', width: token.width })
  }
  items.push(
    { type: 'penalty', width: 0, penalty: Number.POSITIVE_INFINITY, flagged: false },
    { type: 'glue', width: 0, stretch: 100_000, shrink: 0 },
    { type: 'penalty', width: 0, penalty: Number.NEGATIVE_INFINITY, flagged: false },
  )
  metadata.set(items.length - 1, { end: tokens.length, next: tokens.length, hyphen: false, forced: false })
  return { items, metadata, tokenItems }
}
function addHyphenationItems(
  items: ParagraphItem[],
  metadata: Map<number, BreakMeta>,
  tokenItems: readonly number[],
  tokens: readonly ParagraphToken[],
  settings: CompositionSettings,
  markerWidth: number,
  pointsForWord: typeof hyphenationPoints,
): void {
  const breaks: { itemIndex: number; tokenIndex: number; maqaf: boolean }[] = []
  for (const word of wordRanges(tokens)) {
    for (const point of pointsForWord(word.text, settings.language)) {
      const tokenIndex = tokenForOffset(tokens, word.start, point)
      if (tokenIndex === undefined) continue
      const maqaf = word.text[point - 1] === '\u05be'
      if (!maqaf && !settings.hyphenate) continue
      const itemIndex = tokenItems[tokenIndex]
      if (itemIndex === undefined) continue
      breaks.push({ itemIndex: itemIndex + 1, tokenIndex, maqaf })
    }
  }
  for (const point of breaks.sort((a, b) => b.itemIndex - a.itemIndex)) {
    items.splice(point.itemIndex, 0, { type: 'penalty', width: point.maqaf ? 0 : markerWidth, penalty: 50, flagged: !point.maqaf })
    shiftMetadata(metadata, point.itemIndex)
    metadata.set(point.itemIndex, { end: point.tokenIndex + 1, next: point.tokenIndex + 1, hyphen: !point.maqaf, forced: false })
  }
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
    const fittedEnd = tokens[meta.end - 1]?.kind === 'space' ? meta.end - 1 : meta.end
    const spaces = tokens.slice(start, fittedEnd).filter((token) => token.kind === 'space')
    const natural = spaces.length ? spaces.reduce((sum, token) => sum + token.width, 0) / spaces.length : 0
    lines.push({
      start,
      end: meta.end,
      wordSpacing: natural === 0 || !Number.isFinite(percent) ? 0 : natural * (percent / 100 - 1),
      hyphen: meta.hyphen,
      forced: meta.forced,
    })
    start = meta.next
  }
  return lines
}
export function paragraphMeasures(measure: number, indent: number): number[] {
  return [measure - indent, measure]
}

export function paragraphCompositionAction(previousInlineSize: number | undefined, inlineSize: number, textAlign: string, composer: string, lineCount: number) {
  if (previousInlineSize !== undefined && Math.abs(previousInlineSize - inlineSize) <= 0.5) return 'skip'
  const shouldCompose = textAlign === 'justify' && composer === 'paragraph' && lineCount > 1
  if (previousInlineSize !== undefined) return shouldCompose ? 'restore-and-compose' : 'restore'
  return shouldCompose ? 'compose' : 'leave'
}

function firstStrongDirection(text: string): 'ltr' | 'rtl' | undefined {
  for (const character of text) {
    if (/^[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]$/u.test(character)) return 'rtl'
    if (/^\p{Letter}$/u.test(character)) return 'ltr'
  }
  return undefined
}

export function paragraphBaseDirection(ownDirection: string | null, unicodeBidi: string, text: string, computedDirection: string): 'ltr' | 'rtl' {
  const pageDirection = computedDirection === 'rtl' ? 'rtl' : 'ltr'
  const direction = ownDirection?.toLowerCase()
  if (direction === 'ltr' || direction === 'rtl') return direction
  if (direction === 'auto' || unicodeBidi === 'plaintext') return firstStrongDirection(text) ?? pageDirection
  return pageDirection
}
function paragraphLanguage(paragraph: Element, doc: Document): string {
  return paragraph.closest('[lang]')?.getAttribute('lang') ?? doc.documentElement.lang
}

function restoreParagraph(
  paragraph: Element,
  previous: { children: Node[]; inlineSize: number } | undefined,
  composedParagraphs: WeakMap<Element, { children: Node[]; inlineSize: number }>,
  variableValueAttribute: string,
): void {
  if (!previous) return
  paragraph.replaceChildren(...previous.children)
  paragraph.removeAttribute(variableValueAttribute)
  composedParagraphs.delete(paragraph)
}

export function composeParagraphs(
  root: ParentNode,
  doc: Document,
  styleFor: typeof getComputedStyle,
  composedParagraphs: WeakMap<Element, { children: Node[]; inlineSize: number }>,
  readStyle: typeof readCompositionStyle,
  planLines: typeof planParagraphLinesWith,
  breakForLines: typeof breakLines,
  pointsForWord: typeof hyphenationPoints,
  measureContent: typeof contentInlineSize,
  identityAttribute: string,
  continuationAttribute: string,
  variableValueAttribute: string,
): void {
  const cache = new Map<string, number>()
  const profile = paragraphProfile(doc)
  const paragraphs = root.querySelectorAll('p')
  const pass = { paragraphs: paragraphs.length, recomposed: 0, tokens: 0 }
  profile.paragraphs += paragraphs.length
  profile.passes.push(pass)
  const now = () => (doc.defaultView?.performance ?? performance).now()
  for (const paragraph of paragraphs) {
    const rect = paragraph.getBoundingClientRect()
    const style = styleFor(paragraph)
    const inlineSize = measureContent(rect, style)
    const previous = composedParagraphs.get(paragraph)
    if (previous && Math.abs(previous.inlineSize - inlineSize) <= 0.5) continue
    restoreParagraph(paragraph, previous, composedParagraphs, variableValueAttribute)
    if (style.textAlign !== 'justify') continue
    const composition = readStyle(style)
    const composer = composition.composer ?? 'paragraph'
    if (composer !== 'paragraph') continue
    const original = Array.from(paragraph.childNodes)
    const tokensStarted = now()
    const tokens = measuredTokens(paragraph, cache, doc, styleFor, profile)
    profile.tokenMeasurementMs += now() - tokensStarted
    profile.tokens += tokens.length
    pass.tokens += tokens.length
    const indent = Number.parseFloat(style.textIndent) || 0
    const measures = paragraphMeasures(inlineSize, indent)
    const lines = planLines(
      tokens,
      {
        measure: inlineSize,
        language: paragraphLanguage(paragraph, doc),
        hyphenate: composition.hyphenate ?? true,
        indent,
        spacing: composition.wordSpacing ?? { minimum: 80, desired: 100, maximum: 133 },
      },
      hyphenWidth(paragraph, doc, styleFor),
      breakForLines,
      pointsForWord,
      profile,
      now,
    )
    const action = paragraphCompositionAction(previous?.inlineSize, inlineSize, style.textAlign, composer, lines.length)
    if (action === 'leave' || action === 'restore') continue
    composedParagraphs.set(paragraph, { children: original, inlineSize })
    pass.recomposed += 1
    if (paragraph.hasAttribute('data-variable')) paragraph.setAttribute(variableValueAttribute, paragraph.textContent ?? '')
    const rewriteStarted = now()
    rewriteParagraph(
      paragraph,
      tokens,
      lines,
      doc,
      paragraphBaseDirection(paragraph.getAttribute('dir'), style.unicodeBidi, paragraph.textContent ?? '', style.direction),
      identityAttribute,
      continuationAttribute,
      variableValueAttribute,
      measures,
      style.writingMode,
    )
    profile.rewriteMs += now() - rewriteStarted
  }
}

export function paragraphComposerScript(): string {
  return `var composedParagraphs=new WeakMap();var COMPOSITION_IDENTITY_ATTRIBUTE=${JSON.stringify(COMPOSITION_IDENTITY_ATTRIBUTE)};var COMPOSITION_CONTINUATION_ATTRIBUTE=${JSON.stringify(COMPOSITION_CONTINUATION_ATTRIBUTE)};var COMPOSITION_VARIABLE_VALUE_ATTRIBUTE=${JSON.stringify(COMPOSITION_VARIABLE_VALUE_ATTRIBUTE)};
${embedFunction('graphemes', graphemes)}
${embedFunction('inlineExtent', inlineExtent)}
${embedFunction('measurementStyleKey', measurementStyleKey)}
${embedFunction('appendTextTokens', appendTextTokens)}
${embedFunction('appendMeasuredTokens', appendMeasuredTokens)}
${embedFunction('measuredTokens', measuredTokens)}
${embedFunction('hyphenWidth', hyphenWidth)}
${embedFunction('wordRanges', wordRanges)}
${embedFunction('tokenForOffset', tokenForOffset)}
${embedFunction('paragraphItems', paragraphItems)}
${embedFunction('shiftMetadata', shiftMetadata)}
${embedFunction('addHyphenationItems', addHyphenationItems)}
${embedFunction('plannedLines', plannedLines)}
${embedFunction('planParagraphLinesWith', planParagraphLinesWith)}
${embedFunction('paragraphMeasures', paragraphMeasures)}
${embedFunction('paragraphCompositionAction', paragraphCompositionAction)}
${embedFunction('firstStrongDirection', firstStrongDirection)}
${embedFunction('paragraphBaseDirection', paragraphBaseDirection)}
${embedFunction('setRangeStart', setRangeStart)}
${embedFunction('setRangeEnd', setRangeEnd)}
${embedFunction('lineFragment', lineFragment)}
${embedFunction('markCompositionIdentities', markCompositionIdentities)}
${embedFunction('markCompositionContinuations', markCompositionContinuations)}
${embedFunction('removeContinuationIds', removeContinuationIds)}
${embedFunction('correctedWordSpacing', correctedWordSpacing)}
${embedFunction('fitLineToMeasure', fitLineToMeasure)}
${embedFunction('rewriteParagraph', rewriteParagraph)}
${embedFunction('contentInlineSize', contentInlineSize)}
${embedFunction('paragraphLanguage', paragraphLanguage)}
${embedFunction('restoreParagraph', restoreParagraph)}
${embedFunction('paragraphProfile', paragraphProfile)}
${embedFunction('composeParagraphs', composeParagraphs)}`
}
