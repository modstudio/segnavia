// The active-content rule for stored pages and slides: what an author may put
// in a document that a viewer renders and a renderer prints. One rule for
// both, so a preview never shows what the printed copy refuses.

import render from 'dom-serializer'
import { type ChildNode, type Document, type Element, isTag } from 'domhandler'
import { parseDocument } from 'htmlparser2'

// Elements that reach outside the document, embed another one, or submit.
export const REFUSED_ELEMENTS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'portal',
  'link',
  'form',
  'input',
  'button',
  'select',
  'textarea',
])
// SVG's own ways of animating or embedding HTML.
const REFUSED_SVG_ELEMENTS = new Set(['script', 'animate', 'set', 'animatetransform', 'animatemotion', 'foreignobject'])
const REFUSED_ATTRIBUTES = new Set(['srcdoc', 'formaction', 'action'])
const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'srcset', 'poster', 'background', 'data', 'cite', 'longdesc', 'ping'])
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)(?:[;,])/i

export interface SanitizeOptions {
  // https origins a link may point at; any other link is removed.
  linkOrigins?: Iterable<string>
  // Keep the author's scripts, for a document that will run sandboxed.
  keepScripts?: boolean
  // Elements refused in addition to, or instead of, the default set.
  refuseElements?: Iterable<string>
}

export function parse(html: string): Document {
  return parseDocument(html, { lowerCaseAttributeNames: true, recognizeSelfClosing: true })
}

export function serialize(node: Document | ChildNode | ChildNode[]): string {
  return render(node, { encodeEntities: 'utf8' })
}

export function elements(nodes: ChildNode[]): Element[] {
  const found: Element[] = []
  const walk = (list: ChildNode[]) => {
    for (const node of list) {
      if (!isTag(node)) continue
      found.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return found
}

function insideSvg(element: Element): boolean {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (isTag(parent) && parent.name.toLowerCase() === 'svg') return true
  }
  return false
}

// Control characters and whitespace are stripped first, because a browser
// ignores them inside a scheme: `java\tscript:` is still javascript.
function normalizeUrl(value: string): string {
  return [...value]
    .filter((c) => c.charCodeAt(0) > 0x20 && c.charCodeAt(0) !== 0x7f)
    .join('')
    .toLowerCase()
}

function origins(values: Iterable<string> | undefined): Set<string> {
  const set = new Set<string>()
  for (const value of values ?? []) {
    try {
      const url = new URL(value)
      if (url.protocol === 'https:') set.add(url.origin.toLowerCase())
    } catch {}
  }
  return set
}

function safeUrl(attribute: string, value: string, allowed: ReadonlySet<string>): boolean {
  const url = normalizeUrl(value)
  if (attribute === 'href' || attribute === 'xlink:href') {
    if (url.startsWith('#')) return true
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'https:' && allowed.has(parsed.origin)
    } catch {
      return false
    }
  }
  if (attribute === 'srcset') return /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)(?:;[^,]*)?,[^,]*$/i.test(url)
  if (attribute === 'src' || attribute === 'poster') return DATA_IMAGE.test(url)
  return false
}

// A style may name an image only as a data URL; anything else would fetch.
function safeStyle(value: string): boolean {
  const matches = [...value.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)]
  if ((value.match(/url\(/gi)?.length ?? 0) !== matches.length) return false
  return matches.every((match) => normalizeUrl(match[2] ?? '').startsWith('data:image/'))
}

function refusedStyleElement(element: Element): boolean {
  if (element.name.toLowerCase() !== 'style') return false
  const text = element.children.map((child) => ('data' in child ? child.data : '')).join('')
  return /@import/i.test(text) || !safeStyle(text)
}

function refusedElement(element: Element, refused: ReadonlySet<string>, keepScripts: boolean): boolean {
  const name = element.name.toLowerCase()
  if (name === 'script') return !keepScripts
  if (refusedStyleElement(element)) return true
  if (refused.has(name)) return true
  if (insideSvg(element) && REFUSED_SVG_ELEMENTS.has(name)) return true
  // http-equiv can set a CSP, a refresh or a cookie from inside the document.
  return name === 'meta' && Object.keys(element.attribs).some((attribute) => attribute.toLowerCase() === 'http-equiv')
}

function refusedAttribute(name: string, value: string, allowed: ReadonlySet<string>, keepScripts: boolean): boolean {
  const attribute = name.toLowerCase()
  if (attribute.startsWith('on')) return !keepScripts
  return (
    REFUSED_ATTRIBUTES.has(attribute) || (URL_ATTRIBUTES.has(attribute) && !safeUrl(attribute, value, allowed)) || (attribute === 'style' && !safeStyle(value))
  )
}

function refusedSet(options: SanitizeOptions): Set<string> {
  return new Set([...REFUSED_ELEMENTS, ...(options.refuseElements ?? [])].map((name) => name.toLowerCase()))
}

// What the rule would remove, named, so a host can refuse a write with the
// reason rather than store a page that silently prints differently.
export function findActiveContent(html: string, options: SanitizeOptions = {}): string[] {
  const allowed = origins(options.linkOrigins)
  const refused = refusedSet(options)
  const keepScripts = options.keepScripts ?? false
  const found: string[] = []
  for (const element of elements(parse(html).children)) {
    if (refusedElement(element, refused, keepScripts)) found.push(`<${element.name}>`)
    for (const [name, value] of Object.entries(element.attribs)) {
      if (refusedAttribute(name, value, allowed, keepScripts)) found.push(`${element.name}[${name}]`)
    }
  }
  return found
}

export function sanitize(html: string, options: SanitizeOptions = {}): string {
  const allowed = origins(options.linkOrigins)
  const refused = refusedSet(options)
  const keepScripts = options.keepScripts ?? false
  const document = parse(html)
  const prune = (nodes: ChildNode[]): ChildNode[] =>
    nodes.filter((node) => {
      if (!isTag(node)) return true
      if (refusedElement(node, refused, keepScripts)) return false
      for (const [name, value] of Object.entries(node.attribs)) {
        if (refusedAttribute(name, value, allowed, keepScripts)) delete node.attribs[name]
      }
      node.children = prune(node.children)
      return true
    })
  document.children = prune(document.children)
  return serialize(document)
}
