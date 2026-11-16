import { type ChildNode, type Element, isTag, isText } from 'domhandler'
import { element } from './dom.ts'

const PARAGRAPH_CLOSING_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
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
  'listing',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'plaintext',
  'search',
  'section',
  'summary',
  'table',
  'ul',
  'xmp',
])

const RUNNING_TEXT_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'div',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'main',
  'nav',
  'p',
  'pre',
  'search',
  'section',
])

function containsNonWhitespaceText(node: ChildNode): boolean {
  if (isText(node)) return /\S/.test(node.data)
  return isTag(node) && node.children.some(containsNonWhitespaceText)
}

function closesParagraph(node: ChildNode): boolean {
  return isTag(node) && (PARAGRAPH_CLOSING_ELEMENTS.has(node.name) || node.children.some(closesParagraph))
}

function insertMarker(content: ChildNode[], marker: ChildNode[]): void {
  let children = content
  for (;;) {
    const first = children.find((child) => !isText(child) || !/^\s*$/.test(child.data))
    if (!first || !isTag(first) || !RUNNING_TEXT_ELEMENTS.has(first.name) || !containsNonWhitespaceText(first)) break
    children = first.children
  }
  children.unshift(...marker)
}

export function noteBody(className: string, noteId: string, marker: ChildNode[], content: ChildNode[]): Element {
  const name = content.some(closesParagraph) ? 'div' : 'p'
  insertMarker(content, marker)
  return element(name, { class: className, id: noteId }, content)
}
