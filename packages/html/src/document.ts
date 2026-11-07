import { Document, type DocumentInput, type DocumentParseOptions, type Document as ParsedDocument } from '@segnavia/format'
import { isTag } from 'domhandler'
import { markdownHtml } from './markdown.ts'
import { parse, sanitize, serialize } from './sanitize.ts'

export const BLOCK_ELEMENTS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'figure', 'tr'] as const

const BLOCK_ELEMENT_SET: ReadonlySet<string> = new Set(BLOCK_ELEMENTS)

export interface ParseDocumentOptions extends DocumentParseOptions {}

type BlockLocation = { node: string; block: string }
type ContentHtml = (value: string, node: { type: string; id: string }) => string
export type HtmlDocumentNode = ParsedDocument['children'][number]
export type HtmlDocument = ParsedDocument

function contentNodeLabel(node: { type: string; id: string }): string {
  return `${node.type} node "${node.id}"`
}

function dependencyOrigins(html: string): Set<string> {
  const origins = new Set<string>()
  const add = (value: string): void => {
    try {
      const url = new URL(value)
      if (url.protocol === 'https:') origins.add(url.origin)
    } catch {}
  }
  const document = parse(html)
  for (const element of document.children.flatMap(function visit(node): typeof document.children {
    if (!isTag(node)) return []
    return [node, ...node.children.flatMap(visit)]
  })) {
    if (!isTag(element)) continue
    const name = element.name.toLowerCase()
    if (name === 'script' && element.attribs.src) add(element.attribs.src)
    if (name === 'link' && element.attribs.rel?.toLowerCase() === 'stylesheet' && element.attribs.href) add(element.attribs.href)
    const css = name === 'style' ? element.children.map((child) => ('data' in child ? child.data : '')).join('') : element.attribs.style
    for (const match of css?.matchAll(/https:\/\/[^\s"')]+/gi) ?? []) add(match[0])
  }
  return origins
}

function contentHtml(html: string, node: { type: string; id: string }, newId: () => string, seen: Map<string, BlockLocation>, keepScripts: boolean): string {
  const document = parse(sanitize(html, { keepScripts, dependencyOrigins: keepScripts ? dependencyOrigins(html) : undefined }))
  const visit = (children: typeof document.children): void => {
    for (const child of children) {
      if (!isTag(child)) continue
      if (BLOCK_ELEMENT_SET.has(child.name.toLowerCase())) {
        const id = child.attribs['data-segnavia-id'] ?? newId()
        if (!id) throw new Error(`${contentNodeLabel(node)} could not mint a block id; return a non-empty id from newId to clear this refusal`)
        const location = { node: contentNodeLabel(node), block: `<${child.name}>` }
        const first = seen.get(id)
        if (first) {
          throw new Error(
            `block id "${id}" is shared by ${first.block} in ${first.node} and ${location.block} in ${location.node}; change or remove one data-segnavia-id to clear this refusal`,
          )
        }
        child.attribs['data-segnavia-id'] = id
        seen.set(id, location)
      }
      visit(child.children)
    }
  }
  visit(document.children)
  return serialize(document)
}

export function parseDocument(input: DocumentInput | unknown, options: ParseDocumentOptions = {}): HtmlDocument {
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID())
  const document = Document.parse(input, { newId })
  const seen = new Map<string, BlockLocation>()
  const keepScripts = document.settings?.scripts === 'sandboxed'
  const html: ContentHtml = (value, node) => contentHtml(value, node, newId, seen, keepScripts)
  const pageBody = (node: Extract<ParsedDocument['children'][number], { type: 'page' }>) => {
    if (node.body === undefined) return node
    const value = 'html' in node.body ? node.body.html : markdownHtml(node.body, { dir: document.settings?.dir, lang: document.settings?.lang })
    return { ...node, body: { html: html(value, node) } }
  }
  const nodeContent = (node: ParsedDocument['children'][number]): ParsedDocument['children'][number] => {
    if (node.type === 'flow') return { ...node, html: html(node.html, node) }
    if (node.type === 'part' && node.html !== undefined) return { ...node, html: html(node.html, node) }
    if (node.type === 'page') {
      const next = pageBody(node)
      return node.regions === undefined
        ? next
        : { ...next, regions: Object.fromEntries(Object.entries(node.regions).map(([name, value]) => [name, html(value, node)])) }
    }
    if (node.type === 'slide' && 'kind' in node.content && node.content.kind === 'html') {
      return { ...node, content: { ...node.content, html: html(node.content.html, node) } }
    }
    return node
  }
  const nodes = (values: ParsedDocument['children']): ParsedDocument['children'] =>
    values.map((node) => {
      const next = nodeContent(node)
      return 'children' in next ? { ...next, children: nodes(next.children) } : next
    })
  const parentPages = document.parentPages.map((node) => ({
    ...node,
    ...(node.head === undefined ? {} : { head: html(node.head, node) }),
    ...(node.foot === undefined ? {} : { foot: html(node.foot, node) }),
    ...(node.regions === undefined ? {} : { regions: Object.fromEntries(Object.entries(node.regions).map(([name, value]) => [name, html(value, node)])) }),
  }))
  const templates = document.templates.map((node) => ({ ...node, html: html(node.html, node) }))
  return { ...document, children: nodes(document.children), parentPages, templates }
}
