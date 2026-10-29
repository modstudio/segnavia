import { BOOK_FURNITURE, MOTIF_ATTRIBUTE, motifFieldAttribute, resolveDirection } from '@segnavia/format'
import { BOOK_COLUMN_MAX, BOOK_COLUMN_MIN } from '@segnavia/html'
import serialize from 'dom-serializer'
import { Element, Text } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import type { ReportCollector } from './report.ts'
import type { StyleMapper } from './styles.ts'
import type { IdmlFramePreference, IdmlTextNode, IdmlTextVariable } from './types.ts'

const OMITTED = new Set(['Rectangle', 'Group', 'Polygon', 'Table', 'Footnote', 'Note'])
const WRAPPERS = new Set(['HyperlinkTextSource', 'XMLElement', 'Change'])

interface Token {
  kind: 'text' | 'paragraph' | 'variable' | 'processing-instruction' | 'anchored'
  text?: string
  character?: IdmlTextNode
  location: string
  variable?: string
}

export interface StoryHtmlInput {
  id: string
  root?: IdmlTextNode
  direction?: 'ltr' | 'rtl'
  frame?: IdmlFramePreference
  textVariables?: IdmlTextVariable[]
  master?: boolean
}

export interface StoryHtmlResult {
  html: string
  gutter?: number
}

export interface StoryHtmlOptions {
  anchored?: (location: string, direction: 'ltr' | 'rtl') => string | undefined
  inlineParagraphs?: boolean
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
    if (node.name === '#text') result.push({ kind: 'text', text: node.text ?? '', character, location: node.location })
    else if (node.name === 'Br') result.push({ kind: 'paragraph', location: node.location })
    else if (node.name === '#processing-instruction') {
      result.push({ kind: 'processing-instruction', text: node.text ?? '', character, location: node.location })
    } else if (node.name === 'TextVariableInstance') {
      result.push({ kind: 'variable', variable: node.attributes.AssociatedTextVariable, character, location: node.location })
    } else if (node.name === 'TextFrame') result.push({ kind: 'anchored', location: node.location })
    else if (OMITTED.has(node.name)) report.add(report.unsupportedElements, node.name, node.location)
    else if (node.name === 'Properties') return true
    else if (node.name === 'Change' && node.attributes.ChangeType !== undefined && !node.attributes.ChangeType.includes('Inserted')) {
      report.add(report.unsupportedElements, 'Change', node.location)
    } else return false
    return true
  }
  const walk = (node: IdmlTextNode, character?: IdmlTextNode) => {
    if (node.name === 'Content') {
      if (node.children.length === 0) result.push({ kind: 'text', text: node.text ?? '', character, location: node.location })
      else for (const child of node.children) walk(child, character)
      return
    }
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

function matchedVariable(character: IdmlTextNode | undefined, variables: IdmlTextVariable[]): IdmlTextVariable | undefined {
  const style = character ? rangeAttributes(character).AppliedCharacterStyle : undefined
  return variables.find((variable) => variable.appliedCharacterStyle === style)
}

const folioFurniture = BOOK_FURNITURE.find((item) => item.key.endsWith(':folio'))
const markFurniture = BOOK_FURNITURE.find((item) => item.key.endsWith(':mark'))
const markWhich = markFurniture?.fields.find((field) => field.key === 'which')

function furnitureClass(token: Token, styles: StyleMapper, direction: 'ltr' | 'rtl'): string | undefined {
  const characterAttributes = rangeAttributes(token.character)
  const characterStyle = characterAttributes.AppliedCharacterStyle
  return classes(
    styles.styleClass(characterStyle, 'character'),
    styles.overrideClass(characterAttributes, styles.flattened(characterStyle, 'character'), direction, token.character?.location ?? token.location),
  )
}

function markNode(variable: IdmlTextVariable, className: string | undefined): Element | undefined {
  if (!markFurniture) return undefined
  const last = markWhich && 'choices' in markWhich ? markWhich.choices.find((choice) => choice === 'last') : undefined
  const fallback = markWhich && 'default' in markWhich ? markWhich.default : undefined
  return new Element(
    'span',
    {
      [MOTIF_ATTRIBUTE]: markFurniture.key,
      [motifFieldAttribute('name')]: variable.name,
      [motifFieldAttribute('which')]: variable.searchStrategy === 'LastOnPage' ? (last ?? fallback ?? '') : (fallback ?? ''),
      ...(className ? { class: className } : {}),
    },
    [],
  )
}

function furnitureNode(
  token: Token,
  variables: IdmlTextVariable[],
  master: boolean,
  styles: StyleMapper,
  direction: 'ltr' | 'rtl',
  report: ReportCollector,
): Element | undefined {
  const className = furnitureClass(token, styles, direction)
  if (token.kind === 'processing-instruction') {
    if (master && /\bACE\s+18\b/.test(token.text ?? '') && folioFurniture) {
      return new Element('span', { [MOTIF_ATTRIBUTE]: folioFurniture.key, ...(className ? { class: className } : {}) }, [])
    }
    report.add(report.unsupportedSpecialCharacters, token.text ?? 'processing instruction', token.location)
    return undefined
  }
  if (token.kind !== 'variable') return undefined
  const variable = variables.find((candidate) => candidate.id === token.variable)
  if (master && variable) return markNode(variable, className)
  report.add(report.unsupportedElements, variable ? `TextVariable:${variable.name}` : `TextVariableInstance:${token.variable ?? 'unknown'}`, token.location)
  return undefined
}

function paragraphChildren(
  paragraphTokens: Token[],
  styles: StyleMapper,
  report: ReportCollector,
  direction: 'ltr' | 'rtl',
  variables: IdmlTextVariable[],
  master: boolean,
  options: StoryHtmlOptions,
): (Text | Element)[] {
  const children: (Text | Element)[] = []
  let marked: { variable: IdmlTextVariable; node: Element } | undefined
  for (const token of paragraphTokens) {
    if (token.kind === 'text') {
      const variable = master ? undefined : matchedVariable(token.character, variables)
      if (variable) {
        if (marked?.variable.id !== variable.id) {
          marked = { variable, node: new Element('span', { 'data-mark': variable.name }, []) }
          children.push(marked.node)
        }
        marked.node.children.push(...contentNodes(token, styles, direction))
      } else {
        marked = undefined
        children.push(...contentNodes(token, styles, direction))
      }
      continue
    }
    marked = undefined
    if (token.kind === 'anchored') {
      const html = options.anchored?.(token.location, direction)
      if (html)
        children.push(
          ...parseDocument(html, { xmlMode: false }).children.filter((child): child is Text | Element => child instanceof Text || child instanceof Element),
        )
      else if (!options.anchored) report.add(report.unsupportedElements, 'TextFrame', token.location)
      continue
    }
    const furniture = furnitureNode(token, variables, master, styles, direction, report)
    if (furniture) children.push(furniture)
  }
  return children
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
  variables: IdmlTextVariable[],
  master: boolean,
  options: StoryHtmlOptions,
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
  const span = attributes.SpanColumnType ?? flattened.SpanColumnType ?? 'SingleColumn'
  if (frame && frame.columns >= 2 && span === 'SingleColumn') {
    if (Number.isInteger(frame.columns) && frame.columns >= BOOK_COLUMN_MIN && frame.columns <= BOOK_COLUMN_MAX) {
      htmlAttributes['data-columns'] = String(frame.columns)
    } else {
      report.addOnce(report.unsupportedElements, `TextColumnCount:${frame.columns}`, frame.location ?? paragraph.location)
    }
  }
  if (span === 'SplitColumns') report.add(report.unsupportedStyleProperties, 'SpanColumnType:SplitColumns', paragraph.location)

  const children = paragraphChildren(paragraphTokens, styles, report, resolvedDirection, variables, master, options)
  if (children.length === 0) children.push(new Element('br', {}, []))
  return new Element(
    options.inlineParagraphs ? 'span' : 'p',
    options.inlineParagraphs ? { ...htmlAttributes, style: 'display:block' } : htmlAttributes,
    children,
  )
}

export function storyHtml(
  story: StoryHtmlInput,
  styles: StyleMapper,
  report: ReportCollector,
  bookDirection: 'ltr' | 'rtl',
  bookLanguage: string | undefined,
  options: StoryHtmlOptions = {},
): StoryHtmlResult {
  if (!story.root) {
    const empty = new Element(options.inlineParagraphs ? 'span' : 'p', options.inlineParagraphs ? { style: 'display:block' } : {}, [new Element('br', {}, [])])
    return { html: serialize(empty, { xmlMode: false, encodeEntities: 'utf8' }) }
  }
  const paragraphs: Element[] = []
  const paragraphRanges: IdmlTextNode[] = []
  const collectParagraphs = (node: IdmlTextNode): void => {
    if (node.name === 'ParagraphStyleRange') paragraphRanges.push(node)
    else if (node.name === 'Story' || node.name === 'XMLElement') for (const child of node.children) collectParagraphs(child)
  }
  collectParagraphs(story.root)
  for (const paragraph of paragraphRanges) {
    const all = tokens(paragraph, report)
    let current: Token[] = []
    const flush = () => {
      paragraphs.push(
        paragraphNode(
          paragraph,
          current,
          styles,
          report,
          bookDirection,
          bookLanguage,
          story.direction,
          story.frame,
          story.textVariables ?? [],
          story.master ?? false,
          options,
        ),
      )
      current = []
    }
    for (const token of all) {
      if (token.kind === 'paragraph') flush()
      else current.push(token)
    }
    if (current.length > 0 || all.length === 0 || all.at(-1)?.kind !== 'paragraph') flush()
  }
  if (paragraphs.length === 0) {
    paragraphs.push(
      new Element(options.inlineParagraphs ? 'span' : 'p', options.inlineParagraphs ? { style: 'display:block' } : {}, [new Element('br', {}, [])]),
    )
  }
  return { html: serialize(paragraphs, { xmlMode: false, encodeEntities: 'utf8' }), ...(story.frame ? { gutter: story.frame.gutter } : {}) }
}
