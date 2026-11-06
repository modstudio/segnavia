import { Board, type Board as BoardValue } from './board.ts'
import { Book, type Book as BookValue } from './book.ts'
import type { BookItem } from './book-section.ts'
import { Deck, type Deck as DeckValue } from './deck.ts'
import type { Document } from './document.ts'
import type { DocumentNode, PartNode, SectionNode } from './document-nodes.ts'
import { Page, type Page as PageValue } from './page.ts'

function requireKind(document: Document, kind: Document['kind']): void {
  if (document.kind !== kind) {
    throw new Error(`document kind ${document.kind} is not accepted here; use kind ${kind} to clear this refusal`)
  }
}

function settings(document: Document) {
  return document.settings ?? {}
}

function style(document: Document) {
  return document.style ?? {}
}

function data(document: Document) {
  return document.data ?? {}
}

function title(document: Document): string | undefined {
  return document.metadata?.title ?? document.title
}

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

function sectionFields(section: SectionNode) {
  return defined({
    title: section.title,
    contents: section.contents,
    opens: section.opens === 'continue' ? undefined : section.opens,
    parents: section.parents,
  })
}

function pageHtml(node: Extract<DocumentNode, { type: 'page' }>): string {
  if (node.body && 'html' in node.body) return node.body.html
  throw new Error('a book page needs an HTML body; provide body.html to clear this refusal')
}

function placement(node: Extract<DocumentNode, { type: 'placed' }>) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function sectionItem(section: SectionNode, division: 'front' | 'body' | 'end'): BookItem {
  const fields = sectionFields(section)
  const pages = section.children.filter((node): node is Extract<DocumentNode, { type: 'page' }> => node.type === 'page')
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
  const placed = section.children.find((node): node is Extract<DocumentNode, { type: 'placed' }> => node.type === 'placed')
  if (placed) return { kind: 'placed', ...fields, placement: placement(placed) }
  const flow = section.children.find((node): node is Extract<DocumentNode, { type: 'flow' }> => node.type === 'flow')
  if (flow) {
    const flowFields = division === 'body' ? { ...fields, contents: undefined } : fields
    return defined({ ...flowFields, title: section.title ?? flow.title, html: flow.html, runningHead: flow.runningHead }) as BookItem
  }
  throw new Error('a section needs a flow, page or placed child; add one to clear this refusal')
}

function partItem(part: PartNode, division: 'front' | 'body' | 'end'): BookItem {
  return defined({
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

function bookItem(node: DocumentNode, division: 'front' | 'body' | 'end'): BookItem {
  if (node.type === 'part') return partItem(node, division)
  if (node.type === 'section') return sectionItem(node, division)
  if (node.type === 'contents') return defined({ kind: 'contents', title: node.title, opens: node.opens, parents: node.parents }) as BookItem
  if (node.type === 'flow') return defined({ title: node.title, html: node.html, runningHead: node.runningHead }) as BookItem
  if (node.type === 'placed') return { kind: 'placed', contents: true, placement: placement(node) }
  throw new Error(`node ${node.type} cannot lower to a book entry; put it inside a section to clear this refusal`)
}

function bookDivisions(document: Document) {
  const divisions = document.children.filter((node): node is Extract<DocumentNode, { type: 'division' }> => node.type === 'division')
  if (divisions.length === 0) return { frontMatter: [], chapters: document.children.map((node) => bookItem(node, 'body')), endMatter: [] }
  const entries = (name: 'front' | 'body' | 'end') =>
    divisions.filter((division) => division.name === name).flatMap((division) => division.children.map((node) => bookItem(node, name)))
  const body = entries('body')
  const simpleBody = body.every((entry) => !('name' in entry) && (!('kind' in entry) || entry.kind !== 'contents'))
  return { frontMatter: entries('front'), ...(simpleBody ? { chapters: body } : { body }), endMatter: entries('end') }
}

function parentPage(node: Document['parentPages'][number]) {
  const { type: _type, id: _id, geometry, regions: _regions, ...value } = node
  return defined({ ...value, margin: geometry.margin })
}

function template(node: Document['templates'][number]) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function noteSeries(node: Document['noteSeries'][number]) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function contentsOptions(document: Document) {
  let contents: Extract<DocumentNode, { type: 'contents' }> | undefined
  const find = (nodes: DocumentNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'contents' && !contents) contents = node
      if ('children' in node) find(node.children)
    }
  }
  find(document.children)
  return contents ? defined({ pageNumbers: contents.pageNumbers, depth: contents.depth }) : undefined
}

export function bookFromDocument(document: Document): BookValue {
  requireKind(document, 'book')
  const metadata = document.metadata
  return Book.parse(
    defined({
      title: title(document),
      authors: metadata?.authors,
      subject: metadata?.subject,
      limits: document.limits,
      mode: document.mode,
      page: document.page,
      ...settings(document),
      ...style(document),
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

function pageValue(document: Document, printed: boolean): PageValue {
  const child = document.children.find((node): node is Extract<DocumentNode, { type: 'page' }> => node.type === 'page')
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
      body: child.body,
      size: document.size,
      print: document.print,
      limits: document.limits,
      ...settings(document),
      ...style(document),
      ...data(document),
      printedPages,
    }),
  )
}

export function printedFromDocument(document: Document): PageValue {
  requireKind(document, 'printed')
  return pageValue(document, true)
}

export function pageFromDocument(document: Document): PageValue {
  requireKind(document, 'page')
  return pageValue(document, false)
}

export function deckFromDocument(document: Document): DeckValue {
  requireKind(document, 'deck')
  const slides = document.children
    .filter((node): node is Extract<DocumentNode, { type: 'slide' }> => node.type === 'slide')
    .map(({ type: _type, ...slide }) => slide)
  return Deck.parse(
    defined({
      title: title(document),
      size: document.size,
      layout: document.layout,
      fit: document.fit,
      frame: document.frame,
      transition: document.transition,
      playback: document.playback,
      captions: document.captions,
      ...settings(document),
      ...data(document),
      slides,
    }),
  )
}

export function boardFromDocument(document: Document): BoardValue {
  requireKind(document, 'board')
  const items = document.children
    .filter((node): node is Extract<DocumentNode, { type: 'item' }> => node.type === 'item')
    .map(({ type: _type, ...item }) => item)
  const labels = document.children
    .filter((node): node is Extract<DocumentNode, { type: 'label' }> => node.type === 'label')
    .map(({ type: _type, ...label }) => label)
  const sections = document.children
    .filter((node): node is Extract<DocumentNode, { type: 'boardSection' }> => node.type === 'boardSection')
    .map(({ type: _type, ...section }) => section)
  return Board.parse({ title: title(document), direction: document.settings?.dir, items, labels, sections })
}
