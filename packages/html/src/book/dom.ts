import { type ChildNode, Element, isTag, isText, type ParentNode, Text } from 'domhandler'

const HEADING_TEXT_BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'canvas',
  'caption',
  'center',
  'dd',
  'details',
  'dialog',
  'dir',
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
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'menu',
  'nav',
  'noscript',
  'ol',
  'p',
  'pre',
  'section',
  'search',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
  'video',
])

const HEADING_TEXT_HIDDEN_ELEMENTS = new Set(['script', 'style', 'template'])

export function element(name: string, attribs: Record<string, string> = {}, children: ChildNode[] = []): Element {
  const node = new Element(name, attribs, children)
  linkChildren(node)
  return node
}

export function text(value: string): Text {
  return new Text(value)
}

export function linkChildren(parent: ParentNode): void {
  for (const [index, child] of parent.children.entries()) {
    child.parent = parent
    child.prev = parent.children[index - 1] ?? null
    child.next = parent.children[index + 1] ?? null
    if (isTag(child)) linkChildren(child)
  }
}

export function replace(node: ChildNode, replacement: ChildNode): void {
  const parent = node.parent
  if (!parent) return
  const index = parent.children.indexOf(node)
  if (index < 0) return
  parent.children[index] = replacement
  linkChildren(parent)
}

export function insertAfter(node: ChildNode, addition: ChildNode): void {
  const parent = node.parent
  if (!parent) return
  const index = parent.children.indexOf(node)
  if (index < 0) return
  parent.children.splice(index + 1, 0, addition)
  linkChildren(parent)
}

export function append(parent: ParentNode, addition: ChildNode): void {
  parent.children.push(addition)
  linkChildren(parent)
}

export function headingText(node: ChildNode): string {
  if (isText(node)) return node.data
  if (!('children' in node)) return ''
  if (isTag(node) && node.name === 'span' && node.attribs['data-note'] !== undefined) return ''
  if (isTag(node) && HEADING_TEXT_HIDDEN_ELEMENTS.has(node.name)) return ''
  if (isTag(node) && node.name === 'br') return ' '
  const content = node.children.map(headingText).join('')
  if (isTag(node) && HEADING_TEXT_BLOCK_ELEMENTS.has(node.name)) return ` ${content} `
  return content
}
