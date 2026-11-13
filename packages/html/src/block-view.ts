import type { Document } from '@segnavia/format'
import { type ChildNode, type Element, isTag, isText } from 'domhandler'
import { BLOCK_KINDS, type BlockKind } from './block-context.ts'
import { type ContentAddress, contentFragments } from './block-fragments.ts'
import { parse } from './sanitize.ts'

export interface BlockViewEntry {
  id: string
  kind: BlockKind
  text: string
  class?: string
  attributes: Record<string, string>
  address: ContentAddress
  parent?: string
}

function textContent(node: ChildNode): string {
  if (isText(node)) return node.data
  if (!('children' in node) || node.children === undefined) return ''
  return node.children.map(textContent).join('')
}

export function blockElements(children: ChildNode[]): Element[] {
  const result: Element[] = []
  const visit = (nodes: ChildNode[]): void => {
    for (const node of nodes) {
      if (!isTag(node)) continue
      if (BLOCK_KINDS.has(node.name.toLowerCase())) result.push(node)
      visit(node.children)
    }
  }
  visit(children)
  return result
}

function parentBlock(element: Element): string | undefined {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (isTag(parent) && BLOCK_KINDS.has(parent.name.toLowerCase())) return parent.attribs['data-segnavia-id']
  }
  return undefined
}

export function blockView(document: Document): BlockViewEntry[] {
  return contentFragments(document).flatMap(({ address, html }) =>
    blockElements(parse(html).children).map((element) => {
      const { 'data-segnavia-id': id, class: className, ...attributes } = element.attribs
      if (!id) throw new Error('blockView found a block without an id; parse the document again to mint a non-empty id')
      return {
        id,
        kind: element.name.toLowerCase() as BlockKind,
        text: textContent(element),
        ...(className === undefined ? {} : { class: className }),
        attributes,
        address,
        ...(parentBlock(element) === undefined ? {} : { parent: parentBlock(element) }),
      }
    }),
  )
}
