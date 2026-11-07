import { type Document, type DocumentOp, defaultNewId } from '@segnavia/format'
import { type ChildNode, type Element, type Document as HtmlDocument, isTag, Text } from 'domhandler'
import { BLOCK_KINDS, type BlockKind, requireBlockContext } from './block-context.ts'
import { type ContentAddress, type ContentFragment, contentFragments, findFragment, fragmentOp, fragmentOps } from './block-fragments.ts'
import { blockElements } from './block-view.ts'
import { parse, serialize } from './sanitize.ts'

export type BlockPosition = { before: string } | { after: string } | { in: ContentAddress; at: 'start' | 'end' }

export interface BlockOpOptions {
  newId?: () => string
}

export interface SetBlockChange {
  kind?: BlockKind
  html?: string
  text?: string
  class?: string | null
  attributes?: Record<string, string | null>
}

interface ParsedFragment extends ContentFragment {
  tree: HtmlDocument
}

interface FoundBlock {
  fragment: ParsedFragment
  element: Element
}

interface InsertionPoint {
  fragment: ParsedFragment
  parent: HtmlDocument | Element
  index: number
}

function parsedFragments(document: Document): ParsedFragment[] {
  return contentFragments(document).map((fragment) => ({ ...fragment, tree: parse(fragment.html) }))
}

function blockLabel(found: FoundBlock): string {
  const address = found.fragment.address
  const key = address.key === undefined ? '' : ` key "${address.key}"`
  return `<${found.element.name}> in node "${address.node}" field "${address.field}"${key}`
}

function findBlock(fragments: ParsedFragment[], id: string): FoundBlock | undefined {
  if (!id) return undefined
  for (const fragment of fragments) {
    const element = blockElements(fragment.tree.children).find((candidate) => candidate.attribs['data-segnavia-id'] === id)
    if (element) return { fragment, element }
  }
  return undefined
}

function requireBlock(fragments: ParsedFragment[], id: string): FoundBlock {
  const found = findBlock(fragments, id)
  if (!found) throw new Error(`block id "${id}" is unknown; use an id from blockView(document) to clear this refusal`)
  return found
}

function elementParentName(element: Element): string {
  return element.parent !== null && isTag(element.parent) ? element.parent.name.toLowerCase() : 'fragment'
}

function validateContexts(root: Element): void {
  for (const element of [root, ...blockElements(root.children)]) {
    requireBlockContext(element.name.toLowerCase() as BlockKind, elementParentName(element))
  }
}

function requireStableFragment(fragment: ContentFragment, html: string, blockId: string): string {
  if (serialize(parse(html)) === html) return html
  const address = fragment.address
  const key = address.key === undefined ? '' : ` key "${address.key}"`
  throw new Error(
    `block id "${blockId}" would make the parser restructure content in node "${address.node}" field "${address.field}"${key}; use content the parent can hold, for example phrasing content inside p and headings, to clear this refusal`,
  )
}

function usedIds(fragments: ParsedFragment[], omitted: ReadonlySet<Element> = new Set()): Map<string, FoundBlock> {
  const result = new Map<string, FoundBlock>()
  for (const fragment of fragments) {
    for (const element of blockElements(fragment.tree.children)) {
      if (omitted.has(element)) continue
      const id = element.attribs['data-segnavia-id']
      if (id) result.set(id, { fragment, element })
    }
  }
  return result
}

function identifyBlocks(roots: Element[], fragments: ParsedFragment[], newId: () => string, omitted: ReadonlySet<Element> = new Set()): string {
  const seen = usedIds(fragments, omitted)
  const incoming = new Map<string, Element>()
  const elements = [...new Set(roots.flatMap((root) => [root, ...blockElements(root.children)]))]
  for (const element of elements) {
    let id = element.attribs['data-segnavia-id']
    if (!id) {
      id = newId()
      if (!id) throw new Error('inserted block could not mint a block id; return a non-empty id from newId to clear this refusal')
      element.attribs['data-segnavia-id'] = id
    }
    const existing = seen.get(id)
    const firstIncoming = incoming.get(id)
    if (existing || firstIncoming) {
      const first = existing ? blockLabel(existing) : `<${firstIncoming?.name}> in the supplied html`
      throw new Error(
        `supplied data-segnavia-id "${id}" is already used by ${first} and <${element.name}> in the supplied html; change or remove one data-segnavia-id to clear this refusal`,
      )
    }
    incoming.set(id, element)
  }
  return roots[0]?.attribs['data-segnavia-id'] as string
}

function singleBlock(html: string): Element {
  const tree = parse(html)
  const meaningful = tree.children.filter((node) => !(node.type === 'text' && node.data.trim() === '') && node.type !== 'comment')
  const first = meaningful[0]
  if (meaningful.length !== 1 || first === undefined || !isTag(first) || !BLOCK_KINDS.has(first.name.toLowerCase())) {
    throw new Error('insertBlock html is not exactly one block element; supply one element named by BLOCK_ELEMENTS to clear this refusal')
  }
  return first
}

function children(parent: HtmlDocument | Element): ChildNode[] {
  return parent.children
}

function pointForPosition(fragments: ParsedFragment[], position: BlockPosition): InsertionPoint {
  if ('in' in position) {
    const fragment = findFragment(fragments, position.in)
    return { fragment, parent: fragment.tree, index: position.at === 'start' ? 0 : fragment.tree.children.length }
  }
  const id = 'before' in position ? position.before : position.after
  const target = requireBlock(fragments, id)
  const parent = target.element.parent
  if (!parent || !('children' in parent)) throw new Error(`block id "${id}" has no parent; parse the document again to clear this refusal`)
  const index = parent.children.indexOf(target.element)
  return { fragment: target.fragment, parent: parent as HtmlDocument | Element, index: index + ('after' in position ? 1 : 0) }
}

function attach(parent: HtmlDocument | Element, index: number, element: Element): void {
  element.parent = parent
  children(parent).splice(index, 0, element)
}

function detach(element: Element): void {
  const parent = element.parent
  if (!parent || !('children' in parent)) return
  const index = parent.children.indexOf(element)
  if (index >= 0) parent.children.splice(index, 1)
  element.parent = null
}

function isDescendant(parent: HtmlDocument | Element, element: Element): boolean {
  for (let current: ChildNode | null = isTag(parent) ? parent : null; current; current = current.parent) {
    if (current === element) return true
  }
  return false
}

function setChildren(element: Element, next: ChildNode[]): void {
  element.children = next
  for (const child of next) child.parent = element
}

function requireSetBlockChange(change: SetBlockChange): void {
  if (change.html !== undefined && change.text !== undefined) {
    throw new Error('setBlock cannot establish content because html and text were supplied together; remove one to clear this refusal')
  }
  if (Object.keys(change.attributes ?? {}).some((name) => name.toLowerCase() === 'class')) {
    throw new Error('setBlock attributes cannot contain "class"; use the class field to clear this refusal')
  }
}

export function insertBlock(
  document: Document,
  input: { html: string; position: BlockPosition },
  options: BlockOpOptions = {},
): { ops: DocumentOp[]; id: string } {
  const fragments = parsedFragments(document)
  const element = singleBlock(input.html)
  const id = identifyBlocks([element], fragments, options.newId ?? defaultNewId)
  const point = pointForPosition(fragments, input.position)
  element.parent = point.parent
  validateContexts(element)
  attach(point.parent, point.index, element)
  const html = requireStableFragment(point.fragment, serialize(point.fragment.tree), id)
  return { ops: [fragmentOp(point.fragment, html)], id }
}

export function setBlock(document: Document, id: string, change: SetBlockChange, options: BlockOpOptions = {}): DocumentOp[] {
  requireSetBlockChange(change)
  const fragments = parsedFragments(document)
  const found = requireBlock(fragments, id)
  const element = found.element
  if (change.kind !== undefined) {
    if (!BLOCK_KINDS.has(change.kind)) throw new Error(`block kind "${change.kind}" is unknown; use a kind from BLOCK_ELEMENTS to clear this refusal`)
    element.name = change.kind
  }
  if (change.html !== undefined) {
    const removed = new Set(blockElements(element.children))
    const inner = parse(change.html)
    const incoming = blockElements(inner.children)
    const omitted = new Set([...removed, ...incoming])
    identifyBlocks(incoming, fragments, options.newId ?? defaultNewId, omitted)
    setChildren(element, inner.children)
  } else if (change.text !== undefined) {
    setChildren(element, [new Text(change.text)])
  }
  if (change.class !== undefined) {
    if (change.class === null) delete element.attribs.class
    else element.attribs.class = change.class
  }
  for (const [name, value] of Object.entries(change.attributes ?? {})) {
    if (name.toLowerCase() === 'data-segnavia-id') continue
    if (value === null) delete element.attribs[name]
    else element.attribs[name] = value
  }
  validateContexts(element)
  const html = requireStableFragment(found.fragment, serialize(found.fragment.tree), id)
  return [fragmentOp(found.fragment, html)]
}

export function moveBlock(document: Document, id: string, position: BlockPosition, _options: BlockOpOptions = {}): DocumentOp[] {
  const fragments = parsedFragments(document)
  const found = requireBlock(fragments, id)
  const point = pointForPosition(fragments, position)
  if (isDescendant(point.parent, found.element)) {
    throw new Error(`block id "${id}" cannot move into its own descendant; choose a position outside that block to clear this refusal`)
  }
  const sourceHtml = found.fragment.html
  const sourceParent = found.element.parent
  const sourceIndex = sourceParent && 'children' in sourceParent ? sourceParent.children.indexOf(found.element) : -1
  detach(found.element)
  let index = point.index
  if (found.fragment === point.fragment && sourceParent === point.parent && sourceIndex >= 0 && sourceIndex < index) index -= 1
  found.element.parent = point.parent
  validateContexts(found.element)
  attach(point.parent, index, found.element)
  if (found.fragment === point.fragment) {
    const html = requireStableFragment(found.fragment, serialize(found.fragment.tree), id)
    return [fragmentOp(found.fragment, html)]
  }
  const source = { ...found.fragment, html: sourceHtml }
  const sourceResult = requireStableFragment(found.fragment, serialize(found.fragment.tree), id)
  const targetResult = requireStableFragment(point.fragment, serialize(point.fragment.tree), id)
  return fragmentOps([
    { fragment: source, html: sourceResult },
    { fragment: point.fragment, html: targetResult },
  ])
}

export function removeBlock(document: Document, id: string, _options: BlockOpOptions = {}): DocumentOp[] {
  const fragments = parsedFragments(document)
  const found = requireBlock(fragments, id)
  detach(found.element)
  const html = requireStableFragment(found.fragment, serialize(found.fragment.tree), id)
  return [fragmentOp(found.fragment, html)]
}
