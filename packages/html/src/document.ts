import {
  Document,
  type DocumentInput,
  type DocumentParseOptions,
  defaultNewId,
  type PageOrPrintedInput,
  type Document as ParsedDocument,
  pageOrPrintedFromDocument,
} from '@segnavia/format'
import { isTag } from 'domhandler'
import { type AlertLabels, markdownHtml } from './markdown.ts'
import { parse, serialize } from './sanitize.ts'

export const BLOCK_ELEMENTS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'figure', 'tr'] as const

const BLOCK_ELEMENT_SET: ReadonlySet<string> = new Set(BLOCK_ELEMENTS)

export interface ParseDocumentOptions extends DocumentParseOptions {
  alertLabels?: Partial<AlertLabels>
}

type BlockLocation = { node: string; block: string }
type ContentHtml = (value: string, node: { type: string; id: string }) => string

function contentNodeLabel(node: { type: string; id: string }): string {
  return `${node.type} node "${node.id}"`
}

function contentHtml(html: string, node: { type: string; id: string }, newId: () => string, seen: Map<string, BlockLocation>): string {
  const document = parse(html)
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

export function parseDocument(input: DocumentInput | unknown, options: ParseDocumentOptions = {}): ParsedDocument {
  const newId = options.newId ?? defaultNewId
  const document = Document.parse(input, { newId })
  const seen = new Map<string, BlockLocation>()
  const html: ContentHtml = (value, node) => contentHtml(value, node, newId, seen)
  const pageBody = (node: Extract<ParsedDocument['children'][number], { type: 'page' }>) => {
    if (node.body === undefined) return node
    const value =
      'html' in node.body
        ? node.body.html
        : markdownHtml(node.body, {
            dir: document.settings?.dir,
            lang: document.settings?.lang,
            alertLabels: options.alertLabels,
          })
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

export function pageOrPrintedFromInput(input: PageOrPrintedInput, options: ParseDocumentOptions = {}) {
  return pageOrPrintedFromDocument(parseDocument(input, options))
}
