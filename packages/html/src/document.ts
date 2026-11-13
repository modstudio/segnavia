import {
  Document,
  type DocumentInput,
  type DocumentParseOptions,
  defaultNewId,
  type PageBody,
  type PageOrPrintedInput,
  type Document as ParsedDocument,
  pageOrPrintedFromDocument,
} from '@segnavia/format'
import { contentFieldFlows, type FragmentShape } from './block-fragments.ts'
import { type BlockIdLocation, identifyHtmlBlocks, lineNumbersState, sideNotesState } from './block-identify.ts'
import { headingListing } from './heading-listing.ts'
import { type AlertLabels, type BodyHtmlOptions, bodyHtml } from './markdown.ts'
import { elements, parse } from './sanitize.ts'

export { BLOCK_ELEMENTS } from './block-context.ts'

export interface ParseDocumentOptions extends DocumentParseOptions {
  alertLabels?: Partial<AlertLabels>
}

function contentNodeLabel(node: { type: string; id: string }): string {
  return `${node.type} node "${node.id}"`
}

export function pageBodyHtml(body: PageBody, document: Pick<ParsedDocument, 'settings'>, options: Pick<BodyHtmlOptions, 'alertLabels'> = {}): string {
  return bodyHtml(body, { dir: document.settings?.dir, lang: document.settings?.lang, ...options })
}

export function pageBodyFromHtml(html: string, markdown?: string): Extract<PageBody, { html: string }> {
  return markdown === undefined ? { html } : { html, markdown }
}

export function parseDocument(input: DocumentInput | unknown, options: ParseDocumentOptions = {}): ParsedDocument {
  const newId = options.newId ?? defaultNewId
  const document = Document.parse(input, { newId })
  const seen = new Map<string, BlockIdLocation>()
  const identifyOptions = { lineNumbers: lineNumbersState(document), sideNotes: sideNotesState(document) }
  const listHeadings = (identified: string): string => {
    for (const element of elements(parse(identified).children)) {
      if (/^h[1-6]$/.test(element.name)) headingListing(element)
    }
    return identified
  }
  const html = (value: string, node: { type: string; id: string }, flowing: boolean): string => {
    const identified = identifyHtmlBlocks(value, contentNodeLabel(node), newId, seen, { ...identifyOptions, flowing }).html
    return listHeadings(identified)
  }
  const contentHtml = (value: string, node: ParsedDocument['children'][number], shape: FragmentShape): string =>
    html(value, node, contentFieldFlows(document.kind, node.type, shape))
  const regionHtml = (value: string, node: Extract<ParsedDocument['children'][number], { type: 'page' }>, region: string) =>
    listHeadings(identifyHtmlBlocks(value, contentNodeLabel(node), newId, seen, { ...identifyOptions, flowing: false, insideNamedRegion: region }).html)
  const pageBody = (node: Extract<ParsedDocument['children'][number], { type: 'page' }>) => {
    if (node.body === undefined) return node
    const value = pageBodyHtml(node.body, document, options)
    return { ...node, body: pageBodyFromHtml(contentHtml(value, node, 'pageBody'), 'markdown' in node.body ? node.body.markdown : undefined) }
  }
  const nodeContent = (node: ParsedDocument['children'][number]): ParsedDocument['children'][number] => {
    if (node.type === 'flow') return { ...node, html: contentHtml(node.html, node, 'htmlString') }
    if (node.type === 'part' && node.html !== undefined) return { ...node, html: contentHtml(node.html, node, 'htmlString') }
    if (node.type === 'page') {
      const next = pageBody(node)
      return node.regions === undefined
        ? next
        : { ...next, regions: Object.fromEntries(Object.entries(node.regions).map(([name, value]) => [name, regionHtml(value, node, name)])) }
    }
    if (node.type === 'slide' && 'kind' in node.content && node.content.kind === 'html') {
      return { ...node, content: { ...node.content, html: contentHtml(node.content.html, node, 'slideContent') } }
    }
    return node
  }
  const nodes = (values: ParsedDocument['children']): ParsedDocument['children'] =>
    values.map((node) => {
      const next = nodeContent(node)
      return 'children' in next && next.children !== undefined ? { ...next, children: nodes(next.children) } : next
    })
  const parentPages = document.parentPages.map((node) => ({
    ...node,
    regions: Object.fromEntries(
      Object.entries(node.regions).map(([name, region]) => [
        name,
        {
          ...region,
          html: listHeadings(
            identifyHtmlBlocks(region.html, contentNodeLabel(node), newId, seen, { ...identifyOptions, parentRegion: true, insideNamedRegion: name }).html,
          ),
        },
      ]),
    ),
  }))
  const templates = document.templates.map((node) => ({ ...node, html: html(node.html, node, false) }))
  return { ...document, children: nodes(document.children), parentPages, templates }
}

export function pageOrPrintedFromInput(input: PageOrPrintedInput, options: ParseDocumentOptions = {}) {
  const document = parseDocument(input, options)
  if (document.brand !== undefined) {
    throw new Error(
      `Document names brand ${JSON.stringify(document.brand)}; resolve it with resolveBrand, then lower with pageOrPrintedFromDocument(document, brand) to clear this refusal.`,
    )
  }
  return pageOrPrintedFromDocument(document)
}
