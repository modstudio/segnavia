// The active-content rule for stored pages and slides: what an author may put
// in a document that a viewer renders and a renderer prints. One rule for
// both, so a preview never shows what the printed copy refuses.

import { dependencyDecision } from '@segnavia/format'
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
const SCRIPTED_CONTROLS = new Set(['form', 'input', 'button', 'select', 'textarea'])
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
  // https origins a scripted document may use for versioned dependencies.
  dependencyOrigins?: Iterable<string>
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
  if (name === 'link' && keepScripts && element.attribs.rel?.toLowerCase() === 'stylesheet') return false
  if (refused.has(name)) return true
  if (insideSvg(element) && REFUSED_SVG_ELEMENTS.has(name)) return true
  // http-equiv can set a CSP, a refresh or a cookie from inside the document.
  return name === 'meta' && Object.keys(element.attribs).some((attribute) => attribute.toLowerCase() === 'http-equiv')
}

function dependencyAttribute(element: Element, attribute: string, value: string, options: SanitizeOptions): string | undefined {
  if (!options.keepScripts) return undefined
  const tag = element.name.toLowerCase()
  if (!((tag === 'script' && attribute === 'src') || (tag === 'link' && element.attribs.rel?.toLowerCase() === 'stylesheet' && attribute === 'href')))
    return undefined
  const decision = dependencyDecision(value, options.dependencyOrigins)
  return decision.allowed ? '' : decision.reason
}

function refusedAttribute(element: Element, name: string, value: string, allowed: ReadonlySet<string>, options: SanitizeOptions): boolean {
  const attribute = name.toLowerCase()
  if (attribute.startsWith('on')) return !(options.keepScripts ?? false)
  const dependency = dependencyAttribute(element, attribute, value, options)
  if (dependency !== undefined) return dependency !== ''
  return REFUSED_ATTRIBUTES.has(attribute) || (URL_ATTRIBUTES.has(attribute) && !safeUrl(attribute, value, allowed))
}

function refusedSet(options: SanitizeOptions): Set<string> {
  const defaults = options.keepScripts ? [...REFUSED_ELEMENTS].filter((name) => !SCRIPTED_CONTROLS.has(name)) : REFUSED_ELEMENTS
  return new Set([...defaults, ...(options.refuseElements ?? [])].map((name) => name.toLowerCase()))
}

function styleText(element: Element): string {
  return element.children.map((child) => ('data' in child ? child.data : '')).join('')
}

function dependencyCss(source: string, declarations: boolean, options: SanitizeOptions): ReturnType<typeof sanitizeCss> {
  if (!options.keepScripts) return sanitizeCss(source, declarations, options.dataFonts ?? false)
  const restores: string[] = []
  const hold = (url: string) => {
    const decision = dependencyDecision(url, options.dependencyOrigins)
    if (!decision.allowed) return url
    const index = restores.push(url) - 1
    return `data:image/segnavia-dependency-${index},x`
  }
  let protectedCss = source.replace(/@import\s+(?:url\(\s*)?["']?(https:\/\/[^\s"')]+)["']?\s*\)?[^;]*;/gi, (rule, url: string) => {
    const held = hold(url)
    return held === url ? rule : `@namespace url(${held});`
  })
  protectedCss = protectedCss.replace(/@font-face\s*\{[^}]*\}/gi, (block) => block.replace(/https:\/\/[^\s"')]+/gi, hold))
  const result = sanitizeCss(protectedCss, declarations, options.dataFonts ?? false)
  const restore = (value: string) => value.replace(/data:image\/segnavia-dependency-(\d+),x/g, (_, index: string) => restores[Number(index)] ?? '')
  return { css: restore(result.css).replace(/@namespace url\((https:\/\/[^)]+)\);/gi, '@import url($1);'), removed: result.removed.map(restore) }
}

function styleFindings(element: Element, options: SanitizeOptions): string[] {
  const found: string[] = []
  if (element.name.toLowerCase() === 'style') {
    for (const construct of dependencyCss(styleText(element), false, options).removed) found.push(`<style> ${construct}`)
  }
  for (const [name, value] of Object.entries(element.attribs)) {
    if (name.toLowerCase() !== 'style') continue
    for (const construct of dependencyCss(value, true, options).removed) found.push(`${element.name}[${name}] ${construct}`)
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
    found.push(...styleFindings(element, options))
    for (const [name, value] of Object.entries(element.attribs)) {
      if (refusedAttribute(element, name, value, allowed, options)) {
        const reason = dependencyAttribute(element, name.toLowerCase(), value, options)
        found.push(`${element.name}[${name}]${reason ? ` ${reason}` : ''}`)
      }
    }
  }
  return found
}

function cleanStyleElement(element: Element, options: SanitizeOptions): void {
  if (element.name.toLowerCase() !== 'style') return
  const children = element.children.filter((candidate) => 'data' in candidate)
  const child = children[0]
  if (!child || !('data' in child)) return
  child.data = dependencyCss(styleText(element), false, options).css
  for (const extra of children.slice(1)) if ('data' in extra) extra.data = ''
}

function cleanAttributes(element: Element, allowed: ReadonlySet<string>, options: SanitizeOptions): void {
  for (const [name, value] of Object.entries(element.attribs)) {
    if (refusedAttribute(element, name, value, allowed, options)) delete element.attribs[name]
    else if (name.toLowerCase() === 'style') {
      const css = dependencyCss(value, true, options).css.trim()
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
      cleanStyleElement(node, options)
      cleanAttributes(node, allowed, options)
      node.children = prune(node.children)
      return true
    })
  document.children = prune(document.children)
  return serialize(document)
}
