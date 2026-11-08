import { Board, type Board as BoardValue } from './board.ts'
import { Book, type Book as BookValue } from './book.ts'
import type { BookItem } from './book-section.ts'
import { Deck, type Deck as DeckValue } from './deck.ts'
import { Document, type Document as DocumentValue } from './document.ts'
import { Page, type Page as PageValue } from './page.ts'
import type { Brand } from './style-sheet.ts'

type ParsedNode = DocumentValue['children'][number]

function requireKind(document: DocumentValue, kind: DocumentValue['kind']): void {
  if (document.kind !== kind) {
    throw new Error(`document kind ${document.kind} is not accepted here; use kind ${kind} to clear this refusal`)
  }
}

function settings(document: DocumentValue) {
  return document.settings ?? {}
}

function data(document: DocumentValue) {
  return document.data ?? {}
}

function title(document: DocumentValue): string | undefined {
  return document.metadata?.title ?? document.title
}

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

function sectionFields(section: Extract<ParsedNode, { type: 'section' }>) {
  return defined({
    id: section.id,
    title: section.title,
    contents: section.contents,
    opens: section.opens === 'continue' ? undefined : section.opens,
    parents: section.parents,
    numbering: section.numbering,
  })
}

function pageHtml(node: Extract<ParsedNode, { type: 'page' }>): string {
  if (node.body && 'html' in node.body) return node.body.html
  throw new Error('a book page needs an HTML body; provide body.html to clear this refusal')
}

function placement(node: Extract<ParsedNode, { type: 'placed' }>) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function sectionItem(section: Extract<ParsedNode, { type: 'section' }>, division: 'front' | 'body' | 'end'): BookItem {
  const fields = sectionFields(section)
  const pages = section.children.filter((node): node is Extract<ParsedNode, { type: 'page' }> => node.type === 'page')
  if (pages.length > 0 && pages.every((page) => page.regions !== undefined)) {
    const template = section.template
    if (!template) throw new Error('a templated section needs template; name a template to clear this refusal')
    return {
      kind: 'templated',
      ...fields,
      template,
      pages: pages.map((page) => defined({ template: page.template, regions: page.regions ?? {} })),
    }
  }
  if (pages.length > 0) return { kind: 'designed', ...fields, pages: pages.map((page) => ({ html: pageHtml(page) })) }
  const placed = section.children.find((node): node is Extract<ParsedNode, { type: 'placed' }> => node.type === 'placed')
  if (placed) return { kind: 'placed', ...fields, placement: placement(placed) }
  const flow = section.children.find((node): node is Extract<ParsedNode, { type: 'flow' }> => node.type === 'flow')
  if (flow) {
    const flowFields = division === 'body' ? { ...fields, contents: undefined } : fields
    return defined({ ...flowFields, title: section.title ?? flow.title, html: flow.html, runningHead: flow.runningHead }) as BookItem
  }
  throw new Error('a section needs a flow, page or placed child; add one to clear this refusal')
}

function partItem(part: Extract<ParsedNode, { type: 'part' }>, division: 'front' | 'body' | 'end'): BookItem {
  return defined({
    id: part.id,
    name: part.name,
    title: part.title,
    html: part.html,
    contents: part.contents,
    opens: part.opens,
    parents: part.parents,
    runningHead: part.runningHead,
    children: part.children.map((child) => bookItem(child, division)),
  }) as BookItem
}

function bookItem(node: ParsedNode, division: 'front' | 'body' | 'end'): BookItem {
  if (node.type === 'part') return partItem(node, division)
  if (node.type === 'section') return sectionItem(node, division)
  if (node.type === 'contents')
    return defined({ id: node.id, kind: 'contents', title: node.title, opens: node.opens, parents: node.parents, numbering: node.numbering }) as BookItem
  if (node.type === 'flow') return defined({ id: node.id, title: node.title, html: node.html, runningHead: node.runningHead }) as BookItem
  if (node.type === 'placed') return { id: node.id, kind: 'placed', contents: true, placement: placement(node) }
  throw new Error(`node ${node.type} cannot lower to a book entry; put it inside a section to clear this refusal`)
}

function bookDivisions(document: DocumentValue) {
  const divisions = document.children.filter((node): node is Extract<ParsedNode, { type: 'division' }> => node.type === 'division')
  if (divisions.length === 0) return { frontMatter: [], chapters: document.children.map((node) => bookItem(node, 'body')), endMatter: [] }
  const entries = (name: 'front' | 'body' | 'end') =>
    divisions.filter((division) => division.name === name).flatMap((division) => division.children.map((node) => bookItem(node, name)))
  const body = entries('body')
  const simpleBody = body.every((entry) => !('name' in entry) && (!('kind' in entry) || entry.kind !== 'contents'))
  return { frontMatter: entries('front'), ...(simpleBody ? { chapters: body } : { body }), endMatter: entries('end') }
}

function parentPage(node: DocumentValue['parentPages'][number]) {
  const { type: _type, id: _id, geometry, regions: _regions, ...value } = node
  return defined({ ...value, margin: geometry.margin })
}

function template(node: DocumentValue['templates'][number]) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function noteSeries(node: DocumentValue['noteSeries'][number]) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function contentsOptions(document: DocumentValue) {
  let contents: Extract<ParsedNode, { type: 'contents' }> | undefined
  const find = (nodes: ParsedNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'contents' && !contents) contents = node
      if ('children' in node) find(node.children)
    }
  }
  find(document.children)
  return contents ? defined({ pageNumbers: contents.pageNumbers, depth: contents.depth }) : undefined
}

export function bookFromDocument(document: DocumentValue, brand?: Brand): BookValue {
  requireKind(document, 'book')
  const metadata = document.metadata
  return Book.parse(
    defined({
      title: title(document),
      brand,
      authors: metadata?.authors,
      subject: metadata?.subject,
      limits: document.limits,
      mode: document.mode,
      page: document.page,
      ...settings(document),
      style: document.style,
      ...data(document),
      ...bookDivisions(document),
      parentPages: document.parentPages.map(parentPage),
      templates: document.templates.map(template),
      notes: document.noteSeries.map(noteSeries),
      numbering: typeof document.numbering === 'object' ? document.numbering : undefined,
      footnotes: document.footnotes,
      endnotes: document.endnotes,
      rectoOpenings: document.rectoOpenings,
      orphans: document.orphans,
      widows: document.widows,
      fragmentation: document.fragmentation,
      runningHead: document.runningHead,
      contents: contentsOptions(document),
    }),
  )
}

function pageValue(document: DocumentValue, printed: boolean, brand?: Brand): PageValue {
  const child = document.children.find((node): node is Extract<ParsedNode, { type: 'page' }> => node.type === 'page')
  if (!child?.body) throw new Error('the document needs a page body; provide body on its page node to clear this refusal')
  const printedPages = printed
    ? {
        parents: document.parentPages.map(parentPage),
        rules: document.rules,
        numbering: typeof document.numbering === 'string' ? document.numbering : undefined,
        fragmentation: document.fragmentation,
      }
    : undefined
  return Page.parse(
    defined({
      id: child.id,
      brand,
      body: child.body,
      size: document.size,
      print: document.print,
      limits: document.limits,
      ...settings(document),
      style: document.style,
      ...data(document),
      printedPages,
    }),
  )
}

export function printedFromDocument(document: DocumentValue, brand?: Brand): PageValue {
  requireKind(document, 'printed')
  return pageValue(document, true, brand)
}

export function pageFromDocument(document: DocumentValue, brand?: Brand): PageValue {
  requireKind(document, 'page')
  return pageValue(document, false, brand)
}

export const PAGE_OR_PRINTED_KINDS = ['page', 'printed'] as const
export type PageOrPrintedInput = import('./document.ts').DocumentInput

export function pageOrPrintedFromDocument(document: DocumentValue, brand?: Brand): PageValue {
  if (document.kind === 'page') return pageFromDocument(document, brand)
  if (document.kind === 'printed') return printedFromDocument(document, brand)
  throw new Error(`document kind ${document.kind} is not accepted here; use kind ${PAGE_OR_PRINTED_KINDS.join(' or ')} to clear this refusal`)
}

export function deckFromDocument(document: DocumentValue, brand?: Brand): DeckValue {
  requireKind(document, 'deck')
  const slides = document.children
    .filter((node): node is Extract<ParsedNode, { type: 'slide' }> => node.type === 'slide')
    .map(({ type: _type, ...slide }) => slide)
  return Deck.parse(
    defined({
      title: title(document),
      brand,
      size: document.size,
      layout: document.layout,
      fit: document.fit,
      frame: document.frame,
      transition: document.transition,
      playback: document.playback,
      captions: document.captions,
      ...settings(document),
      style: document.style,
      ...data(document),
      slides,
    }),
  )
}

export function boardFromDocument(document: DocumentValue): BoardValue {
  requireKind(document, 'board')
  const items = document.children.filter((node): node is Extract<ParsedNode, { type: 'item' }> => node.type === 'item').map(({ type: _type, ...item }) => item)
  const labels = document.children
    .filter((node): node is Extract<ParsedNode, { type: 'label' }> => node.type === 'label')
    .map(({ type: _type, ...label }) => label)
  const sections = document.children
    .filter((node): node is Extract<ParsedNode, { type: 'boardSection' }> => node.type === 'boardSection')
    .map(({ type: _type, ...section }) => section)
  return Board.parse({ title: title(document), direction: document.settings?.dir, items, labels, sections })
}

export function documentFromBoard(board: BoardValue, source: DocumentValue): DocumentValue {
  requireKind(source, 'board')
  const children: DocumentValue['children'] = [
    ...board.items.map(({ id, ...item }) => ({ type: 'item' as const, id, ...item })),
    ...board.labels.map(({ id, ...label }) => ({ type: 'label' as const, id, ...label })),
    ...board.sections.map(({ id, ...section }) => ({ type: 'boardSection' as const, id, ...section })),
  ]
  const titledSource =
    source.metadata?.title === undefined ? { ...source, title: board.title } : { ...source, metadata: { ...source.metadata, title: board.title } }
  return Document.parse({ ...titledSource, settings: { ...source.settings, dir: board.direction }, children })
}
