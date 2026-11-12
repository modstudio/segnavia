import type { Element } from 'domhandler'
import { isTag } from 'domhandler'
import { BLOCK_KINDS } from './block-context.ts'
import { parse, serialize } from './sanitize.ts'
import { fitIssuesIn } from './fit-attributes.ts'

export interface BlockIdLocation {
  block: string
  node: string
}

function blockElements(children: readonly import('domhandler').ChildNode[]): Element[] {
  const result: Element[] = []
  const visit = (nodes: readonly import('domhandler').ChildNode[]): void => {
    for (const node of nodes) {
      if (!isTag(node)) continue
      if (BLOCK_KINDS.has(node.name.toLowerCase())) result.push(node)
      visit(node.children)
    }
  }
  visit(children)
  return result
}

export function identifyBlockElements(elements: readonly Element[], node: string, newId: () => string, seen: Map<string, BlockIdLocation>): string[] {
  const added: string[] = []
  for (const element of elements) {
    let id = element.attribs['data-segnavia-id']
    if (!id) {
      id = newId()
      if (!id) throw new Error(`${node} could not mint a block id; return a non-empty id from newId to clear this refusal`)
      added.push(id)
    }
    const location = { node, block: `<${element.name}>` }
    const first = seen.get(id)
    if (first) {
      throw new Error(
        `block id "${id}" is shared by ${first.block} in ${first.node} and ${location.block} in ${location.node}; change or remove one data-segnavia-id to clear this refusal`,
      )
    }
    element.attribs['data-segnavia-id'] = id
    seen.set(id, location)
  }
  return added
}

export function identifyHtmlBlocks(html: string, node: string, newId: () => string, seen: Map<string, BlockIdLocation>): { html: string; added: string[] } {
  const tree = parse(html)
  const issues = fitIssuesIn(tree.children, node)
  if (issues.length) throw new RangeError(issues.join(' '))
  const added = identifyBlockElements(blockElements(tree.children), node, newId, seen)
  return { html: serialize(tree), added }
}

export function blockElementsIncludingRoot(root: Element): Element[] {
  return [root, ...blockElements(root.children)]
}
