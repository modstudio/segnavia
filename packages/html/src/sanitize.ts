// The active-content rule for stored pages and slides: what an author may put
// in a document that a viewer renders and a renderer prints. One rule for
// both, so a preview never shows what the printed copy refuses.

import { type FetchKind, type OriginApproval, originDecision, originSet } from '@segnavia/format'
import render from 'dom-serializer'
import { type ChildNode, type Document, type Element, isTag } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import { defaultLinkPolicy, LINK_ELEMENTS, type LinkPolicy, linkAllowed, type ResolvedLinkPolicy, resolveLinkPolicy, urlParserText } from './link-policy.ts'
import { MARKDOWN_CONVERTER_POLICY } from './markdown-policy.ts'
import { sanitizeCss } from './sanitize-css.ts'

// Elements that reach outside the document, embed another one, or submit.
const REFUSED = {
  script: 'always',
  iframe: 'always',
  frame: 'always',
  frameset: 'always',
  object: 'always',
  embed: 'always',
  applet: 'always',
  base: 'always',
  portal: 'always',
  link: 'always',
  form: 'unless-scripts',
  input: 'unless-scripts',
  button: 'unless-scripts',
  select: 'unless-scripts',
  textarea: 'unless-scripts',
} as const
export const REFUSED_ELEMENTS = new Set(Object.keys(REFUSED))
// SVG's own ways of animating or embedding HTML.
const REFUSED_SVG_ELEMENTS = new Set(['script', 'animate', 'set', 'animatetransform', 'animatemotion', 'foreignobject'])
const REFUSED_ATTRIBUTES = new Set(['srcdoc', 'formaction', 'action'])
const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'srcset', 'poster', 'background', 'data', 'cite', 'longdesc', 'ping'])
const DATA_IMAGE_TYPES = String.raw`(?:png|jpeg|gif|webp|svg\+xml)`
const DATA_IMAGE = new RegExp(`^data:image/${DATA_IMAGE_TYPES}(?:[;,])`, 'i')
const DATA_IMAGE_SRCSET = new RegExp(`^data:image/${DATA_IMAGE_TYPES}(?:;[^,]*)?,[^,]*$`, 'i')
const SRCSET_WIDTH = /^[1-9]\d*w$/
const SRCSET_DENSITY = /^(?:\d+(?:\.\d*)?|\.\d+)x$/
const SRCSET_CANDIDATE = /\s*((?:data:[^,\s]*,[^,\s]*)|[^,\s]+)(?:\s+([^\s,]+))?\s*(?:,|$)/iy

export interface SanitizeOptions {
  // Protocols, origins and fragments a link may use. Overrides linkOrigins.
  links?: LinkPolicy
  // https origins a link may point at; any other link is removed.
  linkOrigins?: Iterable<string>
  // Keep the author's scripts, for a document that will run sandboxed.
  keepScripts?: boolean
  // Additional https origins author assets may use, by fetch kind.
  origins?: Iterable<OriginApproval>
  // Keep data: font faces written by the author.
  dataFonts?: boolean
  // Elements refused in addition to, or instead of, the default set.
  refuseElements?: Iterable<string>
  // Markup admitted from a trusted format converter.
  converterPolicy?: ConverterPolicy
}

function materializeOrigins(options: SanitizeOptions): SanitizeOptions {
  return options.origins === undefined ? options : { ...options, origins: [...options.origins] }
}

export interface UrlPolicy {
  linkProtocols: readonly string[]
  linkFragments: boolean
  dataImages: boolean
}

export interface ConverterPolicy {
  urls: UrlPolicy
  inertControls: readonly { element: 'input'; type: 'checkbox'; attribute: 'disabled' }[]
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

function insidePicture(element: Element): boolean {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (isTag(parent) && parent.name.toLowerCase() === 'picture') return true
  }
  return false
}

// A tab is removed before the decision, so `java\tscript:` is still javascript.
function normalizeUrl(value: string): string {
  return urlParserText(value).toLowerCase()
}

export function safeImageSource(value: string): boolean {
  return DATA_IMAGE.test(normalizeUrl(value))
}

function srcsetCandidates(value: string): string[] | undefined {
  const candidates: string[] = []
  SRCSET_CANDIDATE.lastIndex = 0
  while (SRCSET_CANDIDATE.lastIndex < value.length) {
    const candidate = SRCSET_CANDIDATE.exec(value)
    if (!candidate) return undefined
    const descriptor = candidate[2]
    if (descriptor && !SRCSET_WIDTH.test(descriptor) && !(SRCSET_DENSITY.test(descriptor) && Number.parseFloat(descriptor) > 0)) return undefined
    candidates.push(candidate[1] ?? '')
  }
  return candidates.length > 0 ? candidates : undefined
}

function srcsetAssetRefusal(value: string, options: SanitizeOptions): string {
  const candidates = srcsetCandidates(value)
  if (!candidates) {
    if (DATA_IMAGE_SRCSET.test(normalizeUrl(value))) return ''
    return 'srcset could not establish a readable candidate list; use a valid srcset candidate list or a supported data-image srcset to clear this refusal'
  }
  for (const candidate of candidates) {
    if (safeImageSource(candidate)) continue
    const decision = originDecision(candidate, 'image', options.origins, options.keepScripts === true)
    if (!decision.allowed) return decision.reason
  }
  return ''
}

export function hrefAllowed(tag: string, value: string, links: ResolvedLinkPolicy | undefined): boolean {
  if (LINK_ELEMENTS.has(tag)) return links !== undefined && linkAllowed(value, links)
  const normalized = normalizeUrl(value)
  return (normalized.startsWith('#') && normalized.length > 1) || safeImageSource(value)
}

function linkPolicyFromConverter(urls: UrlPolicy, origins?: Set<string>): ResolvedLinkPolicy {
  return { protocols: new Set(urls.linkProtocols), origins, fragments: urls.linkFragments }
}

function safeUrl(tag: string, attribute: string, value: string, links: ResolvedLinkPolicy | undefined, policy?: UrlPolicy): boolean {
  if (attribute === 'href' || attribute === 'xlink:href') {
    return hrefAllowed(tag, value, links)
  }
  const url = normalizeUrl(value)
  if (attribute === 'srcset') return DATA_IMAGE_SRCSET.test(url)
  if (attribute === 'src' || attribute === 'poster') {
    if (policy?.dataImages && safeImageSource(value)) return true
    if (!policy) return safeImageSource(value)
    return false
  }
  return false
}

/** The URL decision used when schema-based authoring admits a link or image. */
export function safeMarkdownUrl(attribute: 'href', value: string, approvals?: Iterable<string>): boolean
export function safeMarkdownUrl(attribute: 'src', value: string, approvals?: Iterable<OriginApproval>): boolean
export function safeMarkdownUrl(attribute: 'href' | 'src', value: string, approvals?: Iterable<string> | Iterable<OriginApproval>): boolean {
  if (attribute === 'src') {
    if (safeImageSource(value)) return true
    return originDecision(value, 'image', approvals as Iterable<OriginApproval> | undefined, false).allowed
  }
  const linkOrigins = approvals as Iterable<string> | undefined
  return linkAllowed(value, linkPolicyFromConverter(MARKDOWN_CONVERTER_POLICY.urls, linkOrigins === undefined ? undefined : originSet(linkOrigins)))
}

function refusedElement(element: Element, refused: ReadonlySet<string>, options: SanitizeOptions, keepScripts: boolean): boolean {
  const name = element.name.toLowerCase()
  if (name === 'script') return !keepScripts
  if (name === 'link' && element.attribs.rel?.toLowerCase() === 'stylesheet') return false
  if (
    options.converterPolicy?.inertControls.some(
      (control) => control.element === name && element.attribs.type?.toLowerCase() === control.type && control.attribute in element.attribs,
    )
  )
    return false
  if (refused.has(name)) return true
  if (insideSvg(element) && REFUSED_SVG_ELEMENTS.has(name)) return true
  // http-equiv can set a CSP, a refresh or a cookie from inside the document.
  return name === 'meta' && Object.keys(element.attribs).some((attribute) => attribute.toLowerCase() === 'http-equiv')
}

function assetAttribute(element: Element, attribute: string, value: string, options: SanitizeOptions): string | undefined {
  const tag = element.name.toLowerCase()
  let kind: FetchKind | undefined
  if (options.keepScripts && tag === 'script' && attribute === 'src') kind = 'script'
  else if (tag === 'link' && element.attribs.rel?.toLowerCase() === 'stylesheet' && attribute === 'href') kind = 'style'
  else if (tag === 'img' && attribute === 'src') kind = 'image'
  else if ((tag === 'img' || (tag === 'source' && insidePicture(element))) && attribute === 'srcset') return srcsetAssetRefusal(value, options)
  if (!kind) return undefined
  if (kind === 'image' && safeImageSource(value)) return ''
  const decision = originDecision(value, kind, options.origins, options.keepScripts === true)
  return decision.allowed ? '' : decision.reason
}

function refusedAttribute(element: Element, name: string, value: string, links: ResolvedLinkPolicy, options: SanitizeOptions): string | undefined {
  const attribute = name.toLowerCase()
  if (attribute.startsWith('on')) return options.keepScripts ? undefined : ''
  const asset = assetAttribute(element, attribute, value, options)
  if (asset !== undefined) return asset || undefined
  return REFUSED_ATTRIBUTES.has(attribute) ||
    (URL_ATTRIBUTES.has(attribute) && !safeUrl(element.name.toLowerCase(), attribute, value, links, options.converterPolicy?.urls))
    ? ''
    : undefined
}

function refusedSet(options: SanitizeOptions): Set<string> {
  const defaults = options.keepScripts
    ? Object.entries(REFUSED)
        .filter(([, rule]) => rule === 'always')
        .map(([name]) => name)
    : REFUSED_ELEMENTS
  return new Set([...defaults, ...(options.refuseElements ?? [])].map((name) => name.toLowerCase()))
}

function styleText(element: Element): string {
  return element.children.map((child) => ('data' in child ? child.data : '')).join('')
}

function assetCss(source: string, declarations: boolean, options: SanitizeOptions): ReturnType<typeof sanitizeCss> & { refusals: string[] } {
  const restores: string[] = []
  const refusals: string[] = []
  const hold = (url: string, kind: FetchKind) => {
    const decision = originDecision(url, kind, options.origins, options.keepScripts === true)
    if (!decision.allowed) {
      refusals.push(decision.reason)
      return url
    }
    const index = restores.push(url) - 1
    return `data:image/segnavia-dependency-${index},x`
  }
  let marker = 'segnavia-held-import'
  while (source.includes(marker)) marker += '-x'
  const imports: string[] = []
  let protectedCss = source.replace(/@import\s+(?:url\(\s*)?["']?(https:\/\/[^\s"')]+)["']?\s*\)?[^;]*;/gi, (rule, url: string) => {
    const held = hold(url, 'style')
    if (held === url) return rule
    const index = imports.push(rule) - 1
    return `.${marker}-${index}{}`
  })
  protectedCss = protectedCss.replace(/@font-face\s*\{[^}]*\}/gi, (block) => block.replace(/https:\/\/[^\s"')]+/gi, (url) => hold(url, 'font')))
  protectedCss = protectedCss.replace(/https:\/\/[^\s"')]+/gi, (url) => hold(url, 'image'))
  const result = sanitizeCss(protectedCss, declarations, options.dataFonts ?? false)
  const restore = (value: string) => value.replace(/data:image\/segnavia-dependency-(\d+),x/g, (_, index: string) => restores[Number(index)] ?? '')
  let css = restore(result.css)
  for (const [index, rule] of imports.entries()) css = css.replace(`.${marker}-${index}{}`, rule)
  return { css, removed: result.removed.map(restore), refusals }
}

/** Asset-policy refusals still visible in authored markup before frame CSP enforcement. */
export function assetOriginRefusals(html: string, options: SanitizeOptions = {}): string[] {
  options = materializeOrigins(options)
  const found: string[] = []
  for (const element of elements(parse(html).children)) {
    if (element.name.toLowerCase() === 'style') found.push(...assetCss(styleText(element), false, options).refusals)
    for (const [name, value] of Object.entries(element.attribs)) {
      const reason = assetAttribute(element, name.toLowerCase(), value, options)
      if (reason) found.push(reason)
      if (name.toLowerCase() === 'style') found.push(...assetCss(value, true, options).refusals)
    }
  }
  return found
}

function styleFindings(element: Element, options: SanitizeOptions): string[] {
  const found: string[] = []
  if (element.name.toLowerCase() === 'style') {
    for (const construct of assetCss(styleText(element), false, options).removed) found.push(`<style> ${construct}`)
  }
  for (const [name, value] of Object.entries(element.attribs)) {
    if (name.toLowerCase() !== 'style') continue
    for (const construct of assetCss(value, true, options).removed) found.push(`${element.name}[${name}] ${construct}`)
  }
  return found
}

// What the rule would remove, named, so a host can refuse a write with the
// reason rather than store a page that silently prints differently.
export function findActiveContent(html: string, options: SanitizeOptions = {}): string[] {
  options = materializeOrigins(options)
  const links = sanitizeLinkPolicy(options)
  const refused = refusedSet(options)
  const keepScripts = options.keepScripts ?? false
  const found: string[] = []
  for (const element of elements(parse(html).children)) {
    if (refusedElement(element, refused, options, keepScripts)) found.push(`<${element.name}>`)
    found.push(...styleFindings(element, options))
    for (const [name, value] of Object.entries(element.attribs)) {
      const reason = refusedAttribute(element, name, value, links, options)
      if (reason !== undefined) found.push(`${element.name}[${name}]${reason ? ` ${reason}` : ''}`)
    }
  }
  return found
}

function cleanStyleElement(element: Element, options: SanitizeOptions): void {
  if (element.name.toLowerCase() !== 'style') return
  const children = element.children.filter((candidate) => 'data' in candidate)
  const child = children[0]
  if (!child || !('data' in child)) return
  child.data = assetCss(styleText(element), false, options).css
  for (const extra of children.slice(1)) if ('data' in extra) extra.data = ''
}

function cleanAttributes(element: Element, links: ResolvedLinkPolicy, options: SanitizeOptions): void {
  for (const [name, value] of Object.entries(element.attribs)) {
    if (refusedAttribute(element, name, value, links, options) !== undefined) delete element.attribs[name]
    else if (name.toLowerCase() === 'style') {
      const css = assetCss(value, true, options).css.trim()
      if (css) element.attribs[name] = css
      else delete element.attribs[name]
    }
  }
}

function sanitizeLinkPolicy(options: SanitizeOptions): ResolvedLinkPolicy {
  if (options.links !== undefined) return resolveLinkPolicy(options.links)
  if (options.converterPolicy !== undefined) return linkPolicyFromConverter(options.converterPolicy.urls)
  return defaultLinkPolicy(originSet(options.linkOrigins), true)
}

export function sanitize(html: string, options: SanitizeOptions = {}): string {
  options = materializeOrigins(options)
  const links = sanitizeLinkPolicy(options)
  const refused = refusedSet(options)
  const keepScripts = options.keepScripts ?? false
  const document = parse(html)
  const prune = (nodes: ChildNode[]): ChildNode[] =>
    nodes.filter((node) => {
      if (!isTag(node)) return true
      if (refusedElement(node, refused, options, keepScripts)) return false
      cleanStyleElement(node, options)
      cleanAttributes(node, links, options)
      node.children = prune(node.children)
      return true
    })
  document.children = prune(document.children)
  return serialize(document)
}
