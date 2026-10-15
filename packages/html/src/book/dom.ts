import { type ChildNode, Element, isTag, type ParentNode, Text } from 'domhandler'

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

export function textContent(node: ChildNode, omitNotes = false): string {
  if ('data' in node) return node.data
  if (!('children' in node)) return ''
  if (omitNotes && isTag(node) && node.name === 'span' && node.attribs['data-note'] !== undefined) return ''
  return node.children.map((child) => textContent(child, omitNotes)).join('')
}
