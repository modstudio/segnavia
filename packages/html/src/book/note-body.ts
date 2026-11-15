import { type ChildNode, type Element, isTag } from 'domhandler'
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

function insertLead(content: ChildNode[], lead: ChildNode[]): void {
  let children = content
  for (let first = children[0]; first && isTag(first) && RUNNING_TEXT_ELEMENTS.has(first.name); first = children[0]) children = first.children
  children.unshift(...lead)
}

export function noteBody(className: string, noteId: string, lead: ChildNode[], content: ChildNode[]): Element {
  const name = content.some((child) => isTag(child) && PARAGRAPH_CLOSING_ELEMENTS.has(child.name)) ? 'div' : 'p'
  insertLead(content, lead)
  return element(name, { class: className, id: noteId }, content)
}
