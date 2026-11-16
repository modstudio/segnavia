import { firstStrongDirection } from '@segnavia/format'
import { embedFunction, type readCompositionStyle } from '@segnavia/html'
import { breakLines, hyphenationPoints } from '@segnavia/layout'
import { logicalExtent, verticalWritingMode } from './composer-axis-policy.ts'
import { type ComposedHjViolation, type HjSpacing, type HjViolation, hjLineRatio, worstViolation } from './composer-hj-violations.ts'
import { contentInlineSize } from './composer-paragraph-box.ts'
import {
  COMPOSITION_CONTINUATION_ATTRIBUTE,
  COMPOSITION_IDENTITY_ATTRIBUTE,
  COMPOSITION_VARIABLE_VALUE_ATTRIBUTE,
  lineFragment,
  markCompositionContinuations,
  markCompositionIdentities,
  paragraphLineNodes,
  removeContinuationIds,
  rewriteParagraph,
  setRangeEnd,
  setRangeStart,
} from './composer-paragraph-dom.ts'
import { appendMeasuredTokens, appendTextTokens, graphemes, measuredTokens, measurementStyleKey, type ParagraphToken } from './composer-paragraph-measure.ts'
import { hyphenWidth, paragraphFitsOneLine, structuredParagraphReuseKey } from './composer-paragraph-performance.ts'
import {
  type ComposedParagraph,
  composesParagraph,
  compositionDefaults,
  type ParagraphCompositionFact,
  paragraphBaseDirection,
  paragraphCompositionAction,
  paragraphCompositionFacts,
  paragraphCompositionUnchanged,
  paragraphLanguage,
  restoreParagraph,
} from './composer-paragraph-policy.ts'

export type { ParagraphToken } from './composer-paragraph-measure.ts'
export { paragraphBaseDirection, paragraphCompositionAction } from './composer-paragraph-policy.ts'
export interface ParagraphLine {
  start: number
  end: number
  wordSpacing: number
  ratio: number
  hyphen: boolean
  forced: boolean
  blank?: boolean
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
interface ParagraphRewrite {
  paragraph: Element
  original: Node[]
  inlineSize: number
  tokens: ParagraphToken[]
  lines: ParagraphLine[]
  direction: string
  spacing: HjSpacing
  violation?: HjViolation
  source?: ParagraphRewrite
  output?: Node[]
}
type ParagraphItem =
  | { type: 'box'; width: number }
  | { type: 'glue'; width: number; stretch: number; shrink: number }
  | { type: 'penalty'; width: number; penalty: number; flagged: boolean }
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
export function planParagraphLinesWith(
  tokens: readonly ParagraphToken[],
  settings: CompositionSettings,
  markerWidth: number,
  breakForLines: typeof breakLines,
  pointsForWord: typeof hyphenationPoints,
): ParagraphLine[] {
  if (paragraphFitsOneLine(tokens, settings)) {
    return [{ start: 0, end: tokens.length, wordSpacing: 0, ratio: 0, hyphen: false, forced: false }]
  }
  const { items, metadata, tokenItems } = paragraphItems(tokens, settings)
  addHyphenationItems(items, metadata, tokenItems, tokens, settings, markerWidth, pointsForWord)
  return plannedLines(tokens, settings, items, metadata, breakForLines)
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
  const breaks: { itemIndex: number; tokenIndex: number; hyphen: boolean }[] = []
  for (const word of wordRanges(tokens)) {
    for (const point of pointsForWord(word.text, settings.language)) {
      const tokenIndex = tokenForOffset(tokens, word.start, point.index)
      if (tokenIndex === undefined) continue
      if (point.hyphen && !settings.hyphenate) continue
      const itemIndex = tokenItems[tokenIndex]
      if (itemIndex === undefined) continue
      breaks.push({ itemIndex: itemIndex + 1, tokenIndex, hyphen: point.hyphen })
    }
  }
  for (const point of breaks.sort((a, b) => b.itemIndex - a.itemIndex)) {
    items.splice(point.itemIndex, 0, { type: 'penalty', width: point.hyphen ? markerWidth : 0, penalty: 50, flagged: point.hyphen })
    shiftMetadata(metadata, point.itemIndex)
    metadata.set(point.itemIndex, { end: point.tokenIndex + 1, next: point.tokenIndex + 1, hyphen: point.hyphen, forced: false })
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
    const adjustmentRatio = hjLineRatio(ratio, meta.forced, meta.end === tokens.length)
    const percent =
      ratio < 0
        ? settings.spacing.desired + ratio * (settings.spacing.desired - settings.spacing.minimum)
        : settings.spacing.desired + ratio * (settings.spacing.maximum - settings.spacing.desired)
    const fittedEnd = tokens[meta.end - 1]?.kind === 'space' ? meta.end - 1 : meta.end
    const spaces = tokens.slice(start, fittedEnd).filter((token) => token.kind === 'space')
    const wordSpaces = spaces.filter((token) => token.text !== '\u200b')
    const natural = wordSpaces.length ? wordSpaces.reduce((sum, token) => sum + token.width, 0) / wordSpaces.length : 0
    if (start === tokens.length && meta.end === tokens.length) continue
    const line = {
      start,
      end: meta.end,
      wordSpacing: natural === 0 || !Number.isFinite(percent) ? 0 : natural * (percent / 100 - 1),
      ratio: adjustmentRatio,
      hyphen: meta.hyphen,
      forced: meta.forced,
      ...(start === meta.end && meta.forced ? { blank: true } : {}),
    }
    lines.push(line)
    start = meta.next
  }
  return lines
}
export function paragraphMeasures(measure: number, indent: number): number[] {
  return [measure - indent, measure]
}

export function resolvedTextIndent(value: string, measure: number): number {
  const parsed = Number.parseFloat(value) || 0
  return value.trim().endsWith('%') ? (parsed / 100) * measure : parsed
}

export function setParagraphVariableValue(paragraph: Element, variableValueAttribute: string): void {
  if (paragraph.hasAttribute('data-variable')) paragraph.setAttribute(variableValueAttribute, paragraph.textContent ?? '')
}

function paragraphRewriteForFact(
  fact: ParagraphCompositionFact,
  doc: Document,
  cache: Map<string, number>,
  hyphenWidths: Map<string, number>,
  reusable: Map<string, ParagraphRewrite>,
  styleFor: typeof getComputedStyle,
  planLines: typeof planParagraphLinesWith,
  breakForLines: typeof breakLines,
  pointsForWord: typeof hyphenationPoints,
): ParagraphRewrite | undefined {
  const { paragraph, previous, inlineSize, style, composition, composer } = fact
  if (!composesParagraph(style.textAlign, composer)) return undefined
  const original = Array.from(paragraph.childNodes)
  const language = paragraphLanguage(paragraph, doc)
  const direction = paragraphBaseDirection(paragraph.getAttribute('dir'), style.unicodeBidi, paragraph.textContent ?? '', style.direction)
  const hyphenate = composition.hyphenate ?? compositionDefaults().hyphenate
  const wordSpacing = composition.wordSpacing ?? compositionDefaults().wordSpacing
  const reuseFacts = [inlineSize, language, direction, measurementStyleKey(paragraph, styleFor), style.textIndent, style.writingMode, hyphenate, wordSpacing]
  let reuseKey = paragraph.childElementCount === 0 ? JSON.stringify([paragraph.textContent ?? '', ...reuseFacts]) : ''
  let source = reuseKey ? reusable.get(reuseKey) : undefined
  let tokens: ParagraphToken[] = []
  if (!source) {
    tokens = measuredTokens(paragraph, cache, doc, styleFor)
    if (paragraph.childElementCount > 0) {
      reuseKey = structuredParagraphReuseKey(paragraph, reuseFacts, tokens)
      source = reusable.get(reuseKey)
    }
  }
  if (source) {
    const action = paragraphCompositionAction(previous?.inlineSize, style.textAlign, composer, source.lines.length)
    if (action === 'leave' || action === 'restore') return undefined
    return {
      paragraph,
      original,
      inlineSize,
      tokens: [],
      lines: source.lines,
      direction,
      spacing: source.spacing,
      ...(source.violation ? { violation: source.violation } : {}),
      source,
    }
  }
  const lines = planLines(
    tokens,
    {
      measure: inlineSize,
      language,
      hyphenate,
      indent: resolvedTextIndent(style.textIndent, inlineSize),
      spacing: wordSpacing,
    },
    hyphenWidth(paragraph, doc, styleFor, hyphenWidths),
    breakForLines,
    pointsForWord,
  )
  const action = paragraphCompositionAction(previous?.inlineSize, style.textAlign, composer, lines.length)
  if (action === 'leave' || action === 'restore') return undefined
  const rewrite = { paragraph, original, inlineSize, tokens, lines, direction, spacing: wordSpacing, violation: worstViolation(lines, wordSpacing) }
  if (reuseKey) reusable.set(reuseKey, rewrite)
  return rewrite
}

export function composeParagraphs(
  root: ParentNode,
  doc: Document,
  styleFor: typeof getComputedStyle,
  composedParagraphs: WeakMap<Element, ComposedParagraph>,
  readStyle: typeof readCompositionStyle,
  planLines: typeof planParagraphLinesWith,
  breakForLines: typeof breakLines,
  pointsForWord: typeof hyphenationPoints,
  measureContent: typeof contentInlineSize,
  identityAttribute: string,
  continuationAttribute: string,
  variableValueAttribute: string,
  composedHjViolations: Map<Element, ComposedHjViolation> = new Map(),
): void {
  const cache = new Map<string, number>()
  const hyphenWidths = new Map<string, number>()
  const paragraphs = root.querySelectorAll('p')
  const facts = paragraphCompositionFacts(paragraphs, styleFor, composedParagraphs, readStyle, measureContent)
  const changedFacts: ParagraphCompositionFact[] = []
  for (const fact of facts) {
    if (paragraphCompositionUnchanged(fact.previous?.inlineSize, fact.inlineSize)) continue
    restoreParagraph(fact.paragraph, fact.previous, composedParagraphs, variableValueAttribute)
    composedHjViolations.delete(fact.paragraph)
    changedFacts.push(fact)
  }
  const rewrites: ParagraphRewrite[] = []
  const reusable = new Map<string, ParagraphRewrite>()
  for (const fact of changedFacts) {
    const rewrite = paragraphRewriteForFact(fact, doc, cache, hyphenWidths, reusable, styleFor, planLines, breakForLines, pointsForWord)
    if (rewrite) rewrites.push(rewrite)
  }
  for (const rewrite of rewrites) {
    const { paragraph, tokens, lines, direction, source } = rewrite
    if (source) {
      rewrite.output = source.output?.map((node) => node.cloneNode(true)) ?? []
      setParagraphVariableValue(paragraph, variableValueAttribute)
    } else {
      setParagraphVariableValue(paragraph, variableValueAttribute)
      rewrite.output = paragraphLineNodes(paragraph, tokens, lines, doc, direction, identityAttribute, continuationAttribute, variableValueAttribute)
    }
  }
  for (const { paragraph, original, inlineSize, output, spacing, violation } of rewrites) {
    paragraph.replaceChildren(...(output ?? []))
    composedParagraphs.set(paragraph, { children: original, inlineSize })
    if (violation) composedHjViolations.set(paragraph, { spacing, violation })
  }
}

export function paragraphComposerScript(): string {
  return `var composedParagraphs=new WeakMap(),composedHjViolations=new Map();var COMPOSITION_IDENTITY_ATTRIBUTE=${JSON.stringify(COMPOSITION_IDENTITY_ATTRIBUTE)};var COMPOSITION_CONTINUATION_ATTRIBUTE=${JSON.stringify(COMPOSITION_CONTINUATION_ATTRIBUTE)};var COMPOSITION_VARIABLE_VALUE_ATTRIBUTE=${JSON.stringify(COMPOSITION_VARIABLE_VALUE_ATTRIBUTE)};
${embedFunction('graphemes', graphemes)}
${embedFunction('verticalWritingMode', verticalWritingMode)}
${embedFunction('logicalExtent', logicalExtent)}
${embedFunction('measurementStyleKey', measurementStyleKey)}
${embedFunction('appendTextTokens', appendTextTokens)}
${embedFunction('appendMeasuredTokens', appendMeasuredTokens)}
${embedFunction('measuredTokens', measuredTokens)}
${embedFunction('hyphenWidth', hyphenWidth)}
${embedFunction('wordRanges', wordRanges)}
${embedFunction('tokenForOffset', tokenForOffset)}
${embedFunction('paragraphFitsOneLine', paragraphFitsOneLine)}
${embedFunction('structuredParagraphReuseKey', structuredParagraphReuseKey)}
${embedFunction('paragraphItems', paragraphItems)}
${embedFunction('shiftMetadata', shiftMetadata)}
${embedFunction('addHyphenationItems', addHyphenationItems)}
${embedFunction('plannedLines', plannedLines)}
${embedFunction('planParagraphLinesWith', planParagraphLinesWith)}
${embedFunction('paragraphMeasures', paragraphMeasures)}
${embedFunction('resolvedTextIndent', resolvedTextIndent)}
${embedFunction('setParagraphVariableValue', setParagraphVariableValue)}
${embedFunction('compositionDefaults', compositionDefaults)}
${embedFunction('paragraphCompositionAction', paragraphCompositionAction)}
${embedFunction('paragraphCompositionUnchanged', paragraphCompositionUnchanged)}
${embedFunction('firstStrongDirection', firstStrongDirection)}
${embedFunction('composesParagraph', composesParagraph)}
${embedFunction('paragraphBaseDirection', paragraphBaseDirection)}
${embedFunction('paragraphCompositionFacts', paragraphCompositionFacts)}
${embedFunction('setRangeStart', setRangeStart)}
${embedFunction('setRangeEnd', setRangeEnd)}
${embedFunction('lineFragment', lineFragment)}
${embedFunction('markCompositionIdentities', markCompositionIdentities)}
${embedFunction('markCompositionContinuations', markCompositionContinuations)}
${embedFunction('removeContinuationIds', removeContinuationIds)}
${embedFunction('paragraphLineNodes', paragraphLineNodes)}
${embedFunction('rewriteParagraph', rewriteParagraph)}
${embedFunction('contentInlineSize', contentInlineSize)}
${embedFunction('paragraphLanguage', paragraphLanguage)}
${embedFunction('restoreParagraph', restoreParagraph)}
${embedFunction('paragraphRewriteForFact', paragraphRewriteForFact)}
${embedFunction('composeParagraphs', composeParagraphs)}`
}
