import { type ChildNode, cloneNode, isTag, isText } from 'domhandler'
import { element } from './dom.ts'

const HIDDEN_HEADING_CONTENT = new Set(['script', 'style', 'template'])

export function headingContent(nodes: ChildNode[]): ChildNode[] {
  return nodes.flatMap((node): ChildNode[] => {
    if (isText(node)) return [cloneNode(node, true)]
    if (!isTag(node)) return []
    if (HIDDEN_HEADING_CONTENT.has(node.name)) return []
    if (node.name === 'span' && node.attribs['data-note'] !== undefined) return []
    const children = headingContent(node.children)
    if (node.name === 'a') return children
    const attribs = Object.fromEntries(Object.entries(node.attribs).filter(([name]) => name !== 'id' && !name.startsWith('data-segnavia-')))
    return [element(node.name, attribs, children)]
  })
}
