import { type ChildNode, Element, isComment, isTag, isText } from 'domhandler'
import { HTML_PROFILE_DIRECTIONS, type HtmlProfile, profileElements, profileLinkPolicy } from './html-profile.ts'
import { linkAllowed, type ResolvedLinkPolicy, urlParserText } from './link-policy.ts'
import { parse, REFUSED_ELEMENTS, refusedAttribute, refusedElement, serialize } from './sanitize.ts'

export interface DroppedContent {
  kind: 'element' | 'attribute' | 'scheme' | 'style'
  name: string
  path: string
}

const DROPPED_CONTENT_LIMIT = 256

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

function schemeName(value: string): string {
  const normalized = urlParserText(value)
  try {
    return new URL(normalized).protocol.replace(/:$/, '').toLowerCase()
  } catch {
    return normalized.split(':', 1)[0]?.toLowerCase() || normalized
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
    if (admitted.has('style') && declaration.name === 'text-align' && alignments.has(declaration.value)) alignment = declaration.value
    else drop({ kind: 'style', name: declaration.name, path })
  }
  if (alignment === undefined) delete element.attribs.style
  else element.attribs.style = `text-align:${alignment}`
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
      state.drop({ kind: 'scheme', name: schemeName(value), path })
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
  if (isTag(node)) return node.children.some(hasNonWhitespaceContent)
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

function cleanElement(element: Element, path: string, state: CleanerState): ChildNode[] {
  const sourceName = element.name.toLowerCase()
  if (refusedElement(element, REFUSED_ELEMENTS, false)) {
    state.drop({ kind: 'element', name: sourceName, path })
    return []
  }

  const admittedName = state.admittedElements[sourceName] ? sourceName : HTML_BLOCK_ELEMENTS.has(sourceName) && state.admittedElements.p ? 'p' : undefined
  const admittedAttributes = new Set(admittedName ? state.admittedElements[admittedName] : [])
  const elementDropped = !state.admittedElements[sourceName]
  if (elementDropped) state.drop({ kind: 'element', name: sourceName, path })
  const unwrapLink = cleanRefusedAttributes(element, path, sourceName, state)
  cleanProfileAttributes(element, path, admittedAttributes, state)
  element.children = cleanNodes(element.children, path, state)

  if (!elementDropped && !unwrapLink) return [element]
  if (!admittedName || unwrapLink) return element.children
  if (admittedName === 'p' && HTML_BLOCK_ELEMENTS.has(sourceName)) return paragraphsAroundInlineRuns(element.children, element.attribs)
  element.name = admittedName
  return [element]
}

function cleanNodes(nodes: ChildNode[], parentPath: string, state: CleanerState): ChildNode[] {
  const siblingIndexes = new Map<string, number>()
  const cleaned: ChildNode[] = []
  for (const node of nodes) {
    if (isComment(node)) {
      state.drop({ kind: 'element', name: '#comment', path: parentPath })
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
    cleaned.push(...cleanElement(node, path, state))
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
  document.children = cleanNodes(document.children, '', { admittedElements, links, alignments, drop })
  return { html: serialize(document), dropped }
}
