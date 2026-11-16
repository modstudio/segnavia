import { type ChildNode, cloneNode, isTag, isText } from 'domhandler'
import { element, headingTextBlock, hiddenHeadingNode, text } from './dom.ts'

export function headingContent(nodes: ChildNode[]): ChildNode[] {
  return nodes.flatMap((node): ChildNode[] => {
    if (isText(node)) return [cloneNode(node, true)]
    if (!isTag(node)) return []
    if (hiddenHeadingNode(node)) return []
    if (node.name === 'br') return [text(' ')]
    const children = headingContent(node.children)
    if (headingTextBlock(node)) return [text(' '), ...children, text(' ')]
    if (node.name === 'a') return children
    const attribs = Object.fromEntries(Object.entries(node.attribs).filter(([name]) => name !== 'id' && !name.startsWith('data-segnavia-')))
    return [element(node.name, attribs, children)]
  })
}
