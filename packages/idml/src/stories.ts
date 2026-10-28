import { resolveDirection } from '@segnavia/format'
import { BOOK_COLUMN_MAX, BOOK_COLUMN_MIN } from '@segnavia/html'
import serialize from 'dom-serializer'
import { Element, Text } from 'domhandler'
import type { ReportCollector } from './report.ts'
import type { StyleMapper } from './styles.ts'
import type { IdmlFramePreference, IdmlTextNode } from './types.ts'

const OMITTED = new Set(['TextFrame', 'Rectangle', 'Group', 'Polygon', 'Table', 'Footnote', 'Note', 'TextVariableInstance'])
const WRAPPERS = new Set(['HyperlinkTextSource', 'XMLElement', 'Change'])

interface Token {
  kind: 'text' | 'paragraph'
  text?: string
  character?: IdmlTextNode
  location: string
}

export interface StoryHtmlInput {
  id: string
  root?: IdmlTextNode
  direction?: 'ltr' | 'rtl'
  frame?: IdmlFramePreference
}

export interface StoryHtmlResult {
  html: string
  gutter?: number
}

function classes(...values: (string | undefined)[]): string | undefined {
  const joined = values.filter(Boolean).join(' ')
  return joined || undefined
}

function rangeAttributes(node: IdmlTextNode | undefined): Record<string, string> {
  if (!node) return {}
  const result = { ...node.attributes }
  const holder = node.children.find((child) => child.name === 'Properties')
  for (const child of holder?.children ?? []) if (child.text) result[child.name] = child.text.trim()
  return result
}

function tokens(root: IdmlTextNode, report: ReportCollector): Token[] {
  const result: Token[] = []
  const terminal = (node: IdmlTextNode, character: IdmlTextNode | undefined): boolean => {
    if (node.name === 'Content') result.push({ kind: 'text', text: node.text ?? '', character, location: node.location })
    else if (node.name === 'Br') result.push({ kind: 'paragraph', location: node.location })
    else if (node.name === '#processing-instruction') report.add(report.unsupportedSpecialCharacters, node.text ?? 'processing instruction', node.location)
    else if (OMITTED.has(node.name)) report.add(report.unsupportedElements, node.name, node.location)
    else if (node.name === 'Properties') return true
    else if (node.name === 'Change' && node.attributes.ChangeType !== undefined && !node.attributes.ChangeType.includes('Inserted')) {
      report.add(report.unsupportedElements, 'Change', node.location)
    } else return false
    return true
  }
  const walk = (node: IdmlTextNode, character?: IdmlTextNode) => {
    if (terminal(node, character)) return
    const nextCharacter = node.name === 'CharacterStyleRange' ? node : character
    if (WRAPPERS.has(node.name)) report.add(report.unsupportedElements, node.name, node.location)
    else if (!['Story', 'ParagraphStyleRange', 'CharacterStyleRange'].includes(node.name)) {
      report.add(report.unsupportedElements, node.name, node.location)
    }
    for (const child of node.children) walk(child, nextCharacter)
  }
  walk(root)
  return result
}

function contentNodes(token: Token, styles: StyleMapper, direction: 'ltr' | 'rtl'): (Text | Element)[] {
  const character = token.character
  const characterAttributes = rangeAttributes(character)
  const characterStyle = characterAttributes.AppliedCharacterStyle
  const characterBase = styles.flattened(characterStyle, 'character')
  const styleClass = styles.styleClass(characterStyle, 'character')
  const localClass = styles.overrideClass(characterAttributes, characterBase, direction, character?.location ?? token.location)
  const nodes = textNodes(token.text ?? '')
  const classValue = classes(styleClass, localClass)
  return classValue ? [new Element('span', { class: classValue }, nodes)] : nodes
}

function textNodes(value: string): (Text | Element)[] {
  const pieces = value.split('\u2028')
  const result: (Text | Element)[] = []
  for (const [index, piece] of pieces.entries()) {
    if (piece) result.push(new Text(piece))
    if (index < pieces.length - 1) result.push(new Element('br', {}, []))
  }
  return result
}

function paragraphNode(
  paragraph: IdmlTextNode,
  paragraphTokens: Token[],
  styles: StyleMapper,
  report: ReportCollector,
  bookDirection: 'ltr' | 'rtl',
  bookLanguage: string | undefined,
  storyDirection: 'ltr' | 'rtl' | undefined,
  frame: IdmlFramePreference | undefined,
): Element {
  const attributes = rangeAttributes(paragraph)
  const styleId = attributes.AppliedParagraphStyle
  const flattened = styles.flattened(styleId, 'paragraph')
  const rawText = paragraphTokens
    .filter((token) => token.kind === 'text')
    .map((token) => token.text ?? '')
    .join('')
  const overriddenDirection = styles.paragraphDirection(attributes)
  const resolvedDirection = overriddenDirection ?? styles.paragraphDirection(flattened) ?? storyDirection ?? resolveDirection(undefined, undefined, rawText)
  const languageName = attributes.AppliedLanguage ?? flattened.AppliedLanguage
  const language = styles.language(languageName, paragraph.location)
  const paragraphClass = styles.styleClass(styleId, 'paragraph')
  const overrideClass = styles.overrideClass(attributes, flattened, resolvedDirection, paragraph.location, styles.paragraphStyleDirection(flattened))
  const htmlAttributes: Record<string, string> = {}
  const className = classes(paragraphClass, overrideClass)
  if (className) htmlAttributes.class = className
  if (resolvedDirection !== bookDirection) htmlAttributes.dir = resolvedDirection
  if (language && language !== bookLanguage) htmlAttributes.lang = language
  const span = attributes.SpanColumnType ?? flattened.SpanColumnType
  if (frame && frame.columns >= 2 && span === 'SingleColumn') {
    if (Number.isInteger(frame.columns) && frame.columns >= BOOK_COLUMN_MIN && frame.columns <= BOOK_COLUMN_MAX) {
      htmlAttributes['data-columns'] = String(frame.columns)
    } else {
      report.addOnce(report.unsupportedElements, `TextColumnCount:${frame.columns}`, frame.location ?? paragraph.location)
    }
  }
  if (span === 'SplitColumns') report.add(report.unsupportedStyleProperties, 'SpanColumnType:SplitColumns', paragraph.location)

  const children: (Text | Element)[] = []
  for (const token of paragraphTokens) {
    if (token.kind !== 'text') continue
    children.push(...contentNodes(token, styles, resolvedDirection))
  }
  if (children.length === 0) children.push(new Element('br', {}, []))
  return new Element('p', htmlAttributes, children)
}

export function storyHtml(
  story: StoryHtmlInput,
  styles: StyleMapper,
  report: ReportCollector,
  bookDirection: 'ltr' | 'rtl',
  bookLanguage: string | undefined,
): StoryHtmlResult {
  if (!story.root) return { html: serialize(new Element('p', {}, [new Element('br', {}, [])]), { xmlMode: false, encodeEntities: 'utf8' }) }
  const paragraphs: Element[] = []
  for (const paragraph of story.root.children.filter((node) => node.name === 'ParagraphStyleRange')) {
    const all = tokens(paragraph, report)
    let current: Token[] = []
    const flush = () => {
      paragraphs.push(paragraphNode(paragraph, current, styles, report, bookDirection, bookLanguage, story.direction, story.frame))
      current = []
    }
    for (const token of all) {
      if (token.kind === 'paragraph') flush()
      else current.push(token)
    }
    if (current.length > 0 || all.length === 0 || all.at(-1)?.kind !== 'paragraph') flush()
  }
  if (paragraphs.length === 0) paragraphs.push(new Element('p', {}, [new Element('br', {}, [])]))
  return { html: serialize(paragraphs, { xmlMode: false, encodeEntities: 'utf8' }), ...(story.frame ? { gutter: story.frame.gutter } : {}) }
}
