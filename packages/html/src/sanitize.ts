// The active-content rule for stored pages and slides: what an author may put
// in a document that a viewer renders and a renderer prints. One rule for
// both, so a preview never shows what the printed copy refuses.

import render from 'dom-serializer'
import { type ChildNode, type Document, type Element, isTag } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import { sanitizeCss } from './sanitize-css.ts'

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
const DATA_IMAGE_TYPES = String.raw`(?:png|jpeg|gif|webp|svg\+xml)`
const DATA_IMAGE = new RegExp(`^data:image/${DATA_IMAGE_TYPES}(?:[;,])`, 'i')
const DATA_IMAGE_SRCSET = new RegExp(`^data:image/${DATA_IMAGE_TYPES}(?:;[^,]*)?,[^,]*$`, 'i')

export interface SanitizeOptions {
  // https origins a link may point at; any other link is removed.
  linkOrigins?: Iterable<string>
  // Keep the author's scripts, for a document that will run sandboxed.
  keepScripts?: boolean
  // Keep data: font faces written by the author.
  dataFonts?: boolean
  // Elements refused in addition to, or instead of, the default set.
  refuseElements?: Iterable<string>
}

export function parse(html: string): Document {
  return parseDocument(html, { lowerCaseAttributeNames: true, recognizeSelfClosing: true, withStartIndices: true, withEndIndices: true })
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
  if (attribute === 'srcset') return DATA_IMAGE_SRCSET.test(url)
  if (attribute === 'src' || attribute === 'poster') return DATA_IMAGE.test(url)
  return false
}

function refusedElement(element: Element, refused: ReadonlySet<string>, keepScripts: boolean): boolean {
  const name = element.name.toLowerCase()
  if (name === 'script') return !keepScripts
  if (refused.has(name)) return true
  if (insideSvg(element) && REFUSED_SVG_ELEMENTS.has(name)) return true
  // http-equiv can set a CSP, a refresh or a cookie from inside the document.
  return name === 'meta' && Object.keys(element.attribs).some((attribute) => attribute.toLowerCase() === 'http-equiv')
}

function refusedAttribute(name: string, value: string, allowed: ReadonlySet<string>, keepScripts: boolean): boolean {
  const attribute = name.toLowerCase()
  if (attribute.startsWith('on')) return !keepScripts
  return REFUSED_ATTRIBUTES.has(attribute) || (URL_ATTRIBUTES.has(attribute) && !safeUrl(attribute, value, allowed))
}

function refusedSet(options: SanitizeOptions): Set<string> {
  return new Set([...REFUSED_ELEMENTS, ...(options.refuseElements ?? [])].map((name) => name.toLowerCase()))
}

function styleText(element: Element): string {
  return element.children.map((child) => ('data' in child ? child.data : '')).join('')
}

function styleFindings(element: Element, dataFonts: boolean): string[] {
  const found: string[] = []
  if (element.name.toLowerCase() === 'style') {
    for (const construct of sanitizeCss(styleText(element), false, dataFonts).removed) found.push(`<style> ${construct}`)
  }
  for (const [name, value] of Object.entries(element.attribs)) {
    if (name.toLowerCase() !== 'style') continue
    for (const construct of sanitizeCss(value, true, dataFonts).removed) found.push(`${element.name}[${name}] ${construct}`)
  }
  return found
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
    found.push(...styleFindings(element, options.dataFonts ?? false))
    for (const [name, value] of Object.entries(element.attribs)) {
      if (refusedAttribute(name, value, allowed, keepScripts)) found.push(`${element.name}[${name}]`)
    }
  }
  return found
}

function cleanStyleElement(element: Element, dataFonts: boolean): void {
  if (element.name.toLowerCase() !== 'style') return
  const children = element.children.filter((candidate) => 'data' in candidate)
  const child = children[0]
  if (!child || !('data' in child)) return
  child.data = sanitizeCss(styleText(element), false, dataFonts).css
  for (const extra of children.slice(1)) if ('data' in extra) extra.data = ''
}

function cleanAttributes(element: Element, allowed: ReadonlySet<string>, keepScripts: boolean, dataFonts: boolean): void {
  for (const [name, value] of Object.entries(element.attribs)) {
    if (refusedAttribute(name, value, allowed, keepScripts)) delete element.attribs[name]
    else if (name.toLowerCase() === 'style') {
      const css = sanitizeCss(value, true, dataFonts).css.trim()
      if (css) element.attribs[name] = css
      else delete element.attribs[name]
    }
  }
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
      cleanStyleElement(node, options.dataFonts ?? false)
      cleanAttributes(node, allowed, keepScripts, options.dataFonts ?? false)
      node.children = prune(node.children)
      return true
    })
  document.children = prune(document.children)
  return serialize(document)
}
