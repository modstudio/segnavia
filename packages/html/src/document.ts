import {
  Document,
  type DocumentInput,
  type DocumentParseOptions,
  defaultNewId,
  type PageOrPrintedInput,
  type Document as ParsedDocument,
  pageOrPrintedFromDocument,
} from '@segnavia/format'
import { type BlockIdLocation, identifyHtmlBlocks } from './block-identify.ts'
import { type AlertLabels, markdownHtml } from './markdown.ts'

export { BLOCK_ELEMENTS } from './block-context.ts'

export interface ParseDocumentOptions extends DocumentParseOptions {
  alertLabels?: Partial<AlertLabels>
}

type ContentHtml = (value: string, node: { type: string; id: string }) => string

function contentNodeLabel(node: { type: string; id: string }): string {
  return `${node.type} node "${node.id}"`
}

export function pageBodyHtml(
  body: { html: string } | { markdown: string },
  document: Pick<ParsedDocument, 'settings'>,
  alertLabels?: Partial<AlertLabels>,
): string {
  return 'html' in body
    ? body.html
    : markdownHtml(body, {
        dir: document.settings?.dir,
        lang: document.settings?.lang,
        alertLabels,
      })
}

export function parseDocument(input: DocumentInput | unknown, options: ParseDocumentOptions = {}): ParsedDocument {
  const newId = options.newId ?? defaultNewId
  const document = Document.parse(input, { newId })
  const seen = new Map<string, BlockIdLocation>()
  const html: ContentHtml = (value, node) => identifyHtmlBlocks(value, contentNodeLabel(node), newId, seen).html
  const pageBody = (node: Extract<ParsedDocument['children'][number], { type: 'page' }>) => {
    if (node.body === undefined) return node
    const value = pageBodyHtml(node.body, document, options.alertLabels)
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
