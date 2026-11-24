import { type ChildNode, Element, isComment, isTag, isText } from 'domhandler'
import { HTML_PROFILE_DIRECTIONS, HTML_PROFILE_MAPPING, type HtmlProfile, profileElements, profileLinkPolicy } from './html-profile.ts'
import { linkAllowed, type ResolvedLinkPolicy, urlParserText } from './link-policy.ts'
import { parse, REFUSED_ELEMENTS, refusedAttribute, refusedElement, serialize } from './sanitize.ts'

export interface DroppedContent {
  kind: 'element' | 'attribute' | 'scheme' | 'style'
  name: string
  path: string
}

const DROPPED_CONTENT_LIMIT = 256
const DOUBLE_BRACE_TOKEN = /\{\{ *([\p{L}_][\p{L}\p{N}_.-]*) *\}\}/gu

// These are HTML's block-level and document-structure elements. This is not
// BLOCK_KINDS, which names editable document subjects rather than HTML flow.
const HTML_BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'li',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'search',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

// These elements can contain source text, but that text is not document text
// and must not become visible when the element itself is removed.
const NON_RENDERED_CONTENT_ELEMENTS = new Set(['style', 'title', 'template', 'noscript', 'head'])

const PHRASING_CONTAINER_ELEMENTS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'a'])

function schemeName(value: string): string | undefined {
  const normalized = urlParserText(value)
  try {
    return new URL(normalized).protocol.replace(/:$/, '').toLowerCase()
  } catch {
    return undefined
  }
}

function styleDeclarations(value: string): { name: string; value: string }[] {
  return value.split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':')
    const name = declaration
      .slice(0, separator < 0 ? undefined : separator)
      .trim()
      .toLowerCase()
    if (!name) return []
    const value =
      separator < 0
        ? ''
        : declaration
            .slice(separator + 1)
            .trim()
            .toLowerCase()
    return [{ name, value }]
  })
}

interface CleanerState {
  admittedElements: Record<string, string[]>
  links: ResolvedLinkPolicy | undefined
  alignments: ReadonlySet<string>
  drop: (content: DroppedContent) => void
  atoms: boolean
}

function cleanAtomTokens(value: string): string {
  return value.replace(DOUBLE_BRACE_TOKEN, (_token, name: string) => `{{${name}}}`)
}

function cleanStyle(
  element: Element,
  path: string,
  admitted: ReadonlySet<string>,
  alignments: ReadonlySet<string>,
  drop: (content: DroppedContent) => void,
): void {
  const style = element.attribs.style
  if (style === undefined) return
  let alignment: string | undefined
  for (const declaration of styleDeclarations(style)) {
    if (admitted.has('style') && declaration.name === HTML_PROFILE_MAPPING.align.property && alignments.has(declaration.value)) {
      alignment = declaration.value
    } else drop({ kind: 'style', name: declaration.name, path })
  }
  if (alignment === undefined) delete element.attribs.style
  else element.attribs.style = `${HTML_PROFILE_MAPPING.align.property}:${alignment}`
}

function cleanDirection(element: Element, path: string, admitted: ReadonlySet<string>, drop: (content: DroppedContent) => void): void {
  const direction = element.attribs.dir
  if (direction === undefined) return
  const normalized = direction.toLowerCase()
  if (admitted.has('dir') && (HTML_PROFILE_DIRECTIONS as readonly string[]).includes(normalized)) element.attribs.dir = normalized
  else {
    delete element.attribs.dir
    drop({ kind: 'attribute', name: 'dir', path })
  }
}

function cleanRefusedAttributes(element: Element, path: string, sourceName: string, state: CleanerState): boolean {
  let unwrapLink = false
  for (const [name, value] of Object.entries(element.attribs)) {
    const attribute = name.toLowerCase()
    if (sourceName === 'a' && attribute === 'href' && (!state.links || !linkAllowed(value, state.links))) {
      delete element.attribs[name]
      unwrapLink = true
      const scheme = schemeName(value)
      state.drop(scheme === undefined ? { kind: 'attribute', name: 'href', path } : { kind: 'scheme', name: scheme, path })
      continue
    }
    if (refusedAttribute(element, name, value, state.links, {}) === undefined) continue
    delete element.attribs[name]
    state.drop({ kind: 'attribute', name: attribute, path })
  }
  return unwrapLink
}

function cleanProfileAttributes(element: Element, path: string, admitted: ReadonlySet<string>, state: CleanerState): void {
  cleanStyle(element, path, admitted, state.alignments, state.drop)
  cleanDirection(element, path, admitted, state.drop)
  for (const name of Object.keys(element.attribs)) {
    const attribute = name.toLowerCase()
    if (attribute === 'style' || attribute === 'dir' || admitted.has(attribute)) continue
    delete element.attribs[name]
    state.drop({ kind: 'attribute', name: attribute, path })
  }
}

function hasNonWhitespaceContent(node: ChildNode): boolean {
  if (isText(node)) return node.data.trim().length > 0
  return true
}

function paragraphsAroundInlineRuns(children: ChildNode[], attributes: Record<string, string>): ChildNode[] {
  const flattened: ChildNode[] = []
  let inlineRun: ChildNode[] = []
  const flushInlineRun = () => {
    if (inlineRun.some(hasNonWhitespaceContent)) flattened.push(new Element('p', { ...attributes }, inlineRun))
    inlineRun = []
  }

  for (const child of children) {
    if (isTag(child) && HTML_BLOCK_ELEMENTS.has(child.name.toLowerCase())) {
      flushInlineRun()
      flattened.push(child)
    } else inlineRun.push(child)
  }
  flushInlineRun()
  return flattened
}

function normalizeListItemParagraph(element: Element, path: string, state: CleanerState): boolean {
  if (element.name.toLowerCase() !== 'li' || element.children.length !== 1) return false
  const paragraph = element.children[0]
  if (!paragraph || !isTag(paragraph) || paragraph.name.toLowerCase() !== 'p') return false
  const paragraphPath = `${path}/p[1]`
  const admitted = new Set(Object.hasOwn(state.admittedElements, 'p') ? state.admittedElements.p : [])
  cleanRefusedAttributes(paragraph, paragraphPath, 'p', state)
  cleanProfileAttributes(paragraph, paragraphPath, admitted, state)
  if (Object.keys(paragraph.attribs).length > 0) return false
  element.children = cleanNodes(paragraph.children, paragraphPath, state, true)
  return true
}

function cleanElement(element: Element, path: string, state: CleanerState, insidePhrasingContainer: boolean): ChildNode[] {
  const sourceName = element.name.toLowerCase()
  if (refusedElement(element, REFUSED_ELEMENTS, false)) {
    state.drop({ kind: 'element', name: sourceName, path })
    return []
  }
  if (NON_RENDERED_CONTENT_ELEMENTS.has(sourceName)) {
    state.drop({ kind: 'element', name: sourceName, path })
    return []
  }

  const childInsidePhrasingContainer = insidePhrasingContainer || PHRASING_CONTAINER_ELEMENTS.has(sourceName)
  if (insidePhrasingContainer && HTML_BLOCK_ELEMENTS.has(sourceName)) {
    state.drop({ kind: 'element', name: sourceName, path })
    cleanRefusedAttributes(element, path, sourceName, state)
    cleanProfileAttributes(element, path, new Set(), state)
    element.children = cleanNodes(element.children, path, state, childInsidePhrasingContainer)
    return element.children
  }

  const sourceAdmitted = Object.hasOwn(state.admittedElements, sourceName)
  const paragraphAdmitted = Object.hasOwn(state.admittedElements, 'p')
  const admittedName = sourceAdmitted ? sourceName : HTML_BLOCK_ELEMENTS.has(sourceName) && paragraphAdmitted ? 'p' : undefined
  const admittedAttributes = new Set(admittedName ? state.admittedElements[admittedName] : [])
  const elementDropped = !sourceAdmitted
  if (elementDropped) state.drop({ kind: 'element', name: sourceName, path })
  const unwrapLink = cleanRefusedAttributes(element, path, sourceName, state)
  cleanProfileAttributes(element, path, admittedAttributes, state)
  if (!normalizeListItemParagraph(element, path, state)) {
    element.children = cleanNodes(element.children, path, state, childInsidePhrasingContainer)
  }

  if (!elementDropped && !unwrapLink) return [element]
  if (!admittedName || unwrapLink) return element.children
  if (admittedName === 'p' && HTML_BLOCK_ELEMENTS.has(sourceName)) return paragraphsAroundInlineRuns(element.children, element.attribs)
  element.name = admittedName
  return [element]
}

function cleanNodes(nodes: ChildNode[], parentPath: string, state: CleanerState, insidePhrasingContainer = false): ChildNode[] {
  const siblingIndexes = new Map<string, number>()
  const cleaned: ChildNode[] = []
  for (const node of nodes) {
    if (isComment(node)) {
      state.drop({ kind: 'element', name: '#comment', path: parentPath })
      continue
    }
    if (isText(node)) {
      if (state.atoms) node.data = cleanAtomTokens(node.data)
      cleaned.push(node)
      continue
    }
    if (!isTag(node)) {
      cleaned.push(node)
      continue
    }
    const name = node.name.toLowerCase()
    const index = (siblingIndexes.get(name) ?? 0) + 1
    siblingIndexes.set(name, index)
    const path = `${parentPath ? `${parentPath}/` : ''}${name}[${index}]`
    cleaned.push(...cleanElement(node, path, state, insidePhrasingContainer))
  }
  return cleaned
}

export function cleanHtml(html: string, profile: HtmlProfile): { html: string; dropped: DroppedContent[] } {
  const document = parse(html)
  const admittedElements = profileElements(profile)
  const links = profileLinkPolicy(profile)
  const alignments = new Set(profile.align ?? [])
  const dropped: DroppedContent[] = []
  const drop = (content: DroppedContent) => {
    if (dropped.length < DROPPED_CONTENT_LIMIT) dropped.push(content)
  }
  document.children = cleanNodes(document.children, '', { admittedElements, links, alignments, atoms: profile.atoms?.pattern === 'double-brace', drop })
  return { html: serialize(document), dropped }
}
