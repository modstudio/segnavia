import { Board, type Board as BoardValue } from './board.ts'
import { Book, type Book as BookValue } from './book.ts'
import { Deck, type Deck as DeckValue } from './deck.ts'
import { Document, type DocumentShapeValue, type Document as DocumentValue } from './document.ts'
import { documentBookProjection, documentSectionFields } from './document-book-items.ts'
import { DOCUMENT_PROFILES } from './document-profile.ts'
import { Page, type Page as PageValue } from './page.ts'
import type { PrintedPages } from './printed-pages.ts'
import { recordExpansion } from './record-expansion.ts'
import type { Brand } from './style-sheet.ts'

type ParsedNode = DocumentValue['children'][number]
type ShapeNode = DocumentShapeValue['children'][number]
const PAGE_AND_DECK_SETTINGS = ['scripts', 'dir', 'lang'] as const satisfies readonly (keyof NonNullable<DocumentValue['settings']> &
  keyof PageValue &
  keyof DeckValue)[]

function requireKind(document: DocumentShapeValue, kind: DocumentShapeValue['kind']): void {
  if (document.kind !== kind) {
    throw new Error(`document kind ${document.kind} is not accepted here; use kind ${kind} to clear this refusal`)
  }
}

function settings(document: DocumentShapeValue) {
  return document.settings ?? {}
}

function pageAndDeckSettings(document: DocumentShapeValue): Pick<NonNullable<DocumentShapeValue['settings']>, (typeof PAGE_AND_DECK_SETTINGS)[number]> {
  const source = settings(document)
  return Object.fromEntries(PAGE_AND_DECK_SETTINGS.flatMap((key) => (source[key] === undefined ? [] : [[key, source[key]]]))) as Pick<
    NonNullable<DocumentValue['settings']>,
    (typeof PAGE_AND_DECK_SETTINGS)[number]
  >
}

function data(document: DocumentShapeValue) {
  return document.data ?? {}
}

function title(document: DocumentShapeValue): string | undefined {
  return document.metadata?.title ?? document.title
}

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

function parentPage(node: DocumentShapeValue['parentPages'][number]) {
  const { type: _type, id: _id, geometry, ...value } = node
  return defined({ ...value, margin: geometry.margin })
}

function template(node: DocumentShapeValue['templates'][number]) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function noteSeries(node: DocumentShapeValue['noteSeries'][number]) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function variable(node: DocumentShapeValue['variables'][number]) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function headTemplate(node: DocumentShapeValue['headTemplates'][number]) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function contentsOptions(document: DocumentShapeValue) {
  let contents: Extract<ShapeNode, { type: 'contents' }> | undefined
  const find = (nodes: ShapeNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'contents' && !contents) contents = node
      if ('children' in node && node.children !== undefined) find(node.children)
    }
  }
  find(document.children)
  return contents ? defined({ pageNumbers: contents.pageNumbers, depth: contents.depth }) : undefined
}

export function bookLoweringFromDocument(document: DocumentShapeValue, brand?: Brand) {
  requireKind(document, 'book')
  const metadata = document.metadata
  const projection = documentBookProjection(document)
  const divisions = projection.divisions
  const simpleBody = divisions.body.every((entry) => !('name' in entry) && (!('kind' in entry) || entry.kind !== 'contents'))
  const loweredDivisions = {
    frontMatter: divisions.frontMatter,
    ...(simpleBody ? { chapters: divisions.body } : { body: divisions.body }),
    endMatter: divisions.endMatter,
  }
  const value = defined({
    title: title(document),
    brand,
    authors: metadata?.authors,
    subject: metadata?.subject,
    extra: metadata?.extra,
    limits: document.limits,
    mode: document.mode,
    outline: document.outline,
    page: document.page,
    asOf: document.asOf,
    print: document.print,
    ...settings(document),
    style: document.style,
    ...data(document),
    ...loweredDivisions,
    parentPages: document.parentPages.map(parentPage),
    parentRules: document.parentRules,
    templates: document.templates.map(template),
    variables: document.variables.map(variable),
    headTemplates: document.headTemplates.map(headTemplate),
    notes: document.noteSeries.map(noteSeries),
    numbering: typeof document.numbering === 'object' ? document.numbering : undefined,
    footnotes: document.footnotes,
    endnotes: document.endnotes,
    rectoOpenings: document.rectoOpenings,
    orphans: document.orphans,
    widows: document.widows,
    fragmentation: document.fragmentation,
    lineNumbers: document.settings?.lineNumbers,
    sideNotes: document.settings?.sideNotes,
    contents: contentsOptions(document),
  })
  return { value, projection }
}

export function bookInputFromDocument(document: DocumentShapeValue, brand?: Brand) {
  return bookLoweringFromDocument(document, brand).value
}

export function bookFromDocument(document: DocumentValue, brand?: Brand): BookValue {
  return Book.parse(bookInputFromDocument(document, brand))
}

export interface PrintedSectionEntry {
  value: NonNullable<PrintedPages['sections']>[number]
  path: (string | number)[]
}

export function printedSectionEntries(document: DocumentShapeValue): PrintedSectionEntry[] {
  const expanded = recordExpansion(document)
  return document.children.flatMap((node, index): PrintedSectionEntry[] => {
    const path = ['children', index]
    if (node.type === 'record') {
      const section = expanded.get(node)
      if (!section) throw new Error('record expansion was not established during lowering')
      return [
        {
          path,
          value: {
            ...section,
            id: section.id ?? `children.${index}`,
            ...(section.recordTemplate
              ? { recordTemplate: { name: section.recordTemplate.name, slots: section.recordTemplate.slots.map(({ key }) => ({ key })) } }
              : {}),
          },
        },
      ]
    }
    if (node.type !== 'section') return []
    const flow = node.children[0]
    if (flow?.type !== 'flow') throw new Error(DOCUMENT_PROFILES.printed.sectionChildren.message)
    const fields = documentSectionFields(node, ['children', index])
    return [
      {
        path,
        value: defined({
          id: fields.id,
          title: fields.title,
          opens: fields.opens,
          numbering: fields.numbering,
          parentRules: fields.parentRules,
          html: flow.html,
        }),
      },
    ]
  })
}

export function pageLoweringFromDocument(document: DocumentShapeValue, brand?: Brand) {
  const printed = document.kind === 'printed'
  const child = document.children.find((node): node is Extract<ShapeNode, { type: 'page' }> => node.type === 'page')
  const sectionEntries = printed ? printedSectionEntries(document) : []
  const sections = sectionEntries.map((entry) => entry.value)
  if (!child?.body && sections.length === 0) throw new Error('the document needs a page body; provide body on its page node to clear this refusal')
  const printedPages = printed
    ? {
        outline: document.outline,
        parents: document.parentPages.map(parentPage),
        parentRules: document.parentRules,
        numbering: typeof document.numbering === 'string' ? document.numbering : undefined,
        fragmentation: document.fragmentation,
        variables: document.variables.map(variable),
        headTemplates: document.headTemplates.map(headTemplate),
        lineNumbers: document.settings?.lineNumbers,
        sideNotes: document.settings?.sideNotes,
        ...(sections.length > 0 ? { sections } : {}),
      }
    : undefined
  const value = defined({
    id: child?.id,
    brand,
    body: child?.body,
    size: document.size,
    asOf: document.asOf,
    print: document.print,
    limits: document.limits,
    ...pageAndDeckSettings(document),
    style: document.style,
    ...data(document),
    printedPages,
  })
  return { value, sectionPaths: sectionEntries.map((entry) => entry.path) }
}

export function pageInputFromDocument(document: DocumentShapeValue, brand?: Brand) {
  return pageLoweringFromDocument(document, brand).value
}

export function printedFromDocument(document: DocumentValue, brand?: Brand): PageValue {
  requireKind(document, 'printed')
  return Page.parse(pageInputFromDocument(document, brand))
}

export function pageFromDocument(document: DocumentValue, brand?: Brand): PageValue {
  requireKind(document, 'page')
  return Page.parse(pageInputFromDocument(document, brand))
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
      asOf: document.asOf,
      print: document.print,
      ...pageAndDeckSettings(document),
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
