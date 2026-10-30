import {
  BOOK_PARENT_NAMES,
  type Book,
  type BookView,
  type BookViewPagination,
  flowingParentNames,
  formatNumber,
  PRINTED_PAGE_LIMIT,
  PX_PER_MM,
  resolveParentPages,
  textArea,
} from '@segnavia/format'
import { bookStylesheet } from '@segnavia/html'
import { BOOK_COMPOSED_ATTRIBUTE, composerScript } from './book-composer.ts'
import { BOOK_LAYOUTS, bookPresentationScript, embeddedBookPresentationFunctions } from './book-presentation.ts'
import { frameDocument } from './bridge.ts'

export interface PaginatedDocumentOptions {
  nonce: string
  fontCss?: string
  css?: string
  printBackground?: boolean
  screen?: { spread: boolean }
}

function px(value: number): number {
  return value * PX_PER_MM
}

function folios(system: Book['numbering']['body']): string[] {
  return Array.from({ length: PRINTED_PAGE_LIMIT }, (_, index) => formatNumber(index + 1, system))
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1]
}

function flowTextAreas(html: string, parents: Array<{ name: string; textArea: { width: number; height: number } }>) {
  const byName = new Map(parents.map((parent) => [parent.name, parent.textArea]))
  const areas: Record<string, { width: number; height: number }> = {}
  for (const match of html.matchAll(/<[^>]+\sdata-segnavia-flow="[^"]+"[^>]*>/g)) {
    const tag = match[0]
    if (attribute(tag, 'data-segnavia-kind') === 'fixed' || attribute(tag, 'data-segnavia-kind') === 'templated') continue
    const id = attribute(tag, 'data-segnavia-flow')
    if (!id) continue
    const names = flowingParentNames({
      opener: attribute(tag, 'data-parent-opener'),
      recto: attribute(tag, 'data-parent-recto'),
      verso: attribute(tag, 'data-parent-verso'),
    })
    const held = [byName.get(names.opener), byName.get(names.recto), byName.get(names.verso)]
    if (held.some((area) => area === undefined)) continue
    const resolved = held as Array<{ width: number; height: number }>
    areas[id] = { width: resolved[0]?.width ?? 0, height: Math.min(...resolved.map((area) => area.height)) }
  }
  return areas
}

export function paginatedViewDocument(view: BookView, pagination: BookViewPagination, options: PaginatedDocumentOptions): string {
  const paper = { width: px(pagination.paper.width), height: px(pagination.paper.height) }
  const parents = resolveParentPages(pagination.parents).map((parent) => {
    const margin = {
      top: px(parent.margin.top),
      bottom: px(parent.margin.bottom),
      inner: px(parent.margin.inner),
      outer: px(parent.margin.outer),
    }
    return { ...parent, margin, textArea: textArea({ margin }, paper) }
  })
  const config = {
    direction: pagination.direction,
    dir: view.dir,
    lang: view.lang,
    geometry: {
      paperWidth: px(pagination.paper.width),
      paperHeight: px(pagination.paper.height),
      columnGap: px(pagination.columnGap),
      notesGap: 9,
    },
    orphans: pagination.orphans,
    widows: pagination.widows,
    rectoOpenings: pagination.rectoOpenings,
    endnotePlacement: pagination.endnotePlacement,
    runningHead: pagination.runningHead,
    contentsPageNumbers: pagination.contents.pageNumbers,
    parents,
    flowTextAreas: flowTextAreas(view.html, parents),
    parentNames: BOOK_PARENT_NAMES,
    folios: { front: folios(pagination.numbering.frontMatter), body: folios(pagination.numbering.body) },
    limit: PRINTED_PAGE_LIMIT,
    ...(options.screen ? { screen: options.screen } : {}),
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const bookCss = bookStylesheet(options.fontCss, view.css, options.css)
  const css =
    `@page{size:${pagination.paper.width}mm ${pagination.paper.height}mm;margin:0}` +
    `:where(html,body){margin:0!important;padding:0!important}` +
    `:where(html:not([${BOOK_COMPOSED_ATTRIBUTE}]),html:not([${BOOK_COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}` +
    `:where([data-segnavia-galleys]){position:absolute;inset-block-start:0;inset-inline-start:0}` +
    `:where([data-segnavia-pages]){inline-size:${pagination.paper.width}mm}` +
    `:where([data-segnavia-book-page]:last-child){break-after:auto}` +
    `@media print{:where([data-segnavia-galley-source]){display:none!important}}` +
    bookCss
  const body = `${view.html}<script nonce="${options.nonce}">${composerScript(json, options.screen !== undefined)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: pagination.direction,
    lang: view.lang,
    css,
    relayKeys: false,
    reportHeight: false,
    readyAfterAttribute: BOOK_COMPOSED_ATTRIBUTE,
    printBackground: options.printBackground,
  })
}

export function flowViewDocument(view: BookView, options: Pick<PaginatedDocumentOptions, 'nonce' | 'fontCss' | 'css'>): string {
  if (!view.flow || !view.pagination) throw new Error('A flow frame requires a paginated view built with its flow.')
  const script = `var BOOK_LAYOUTS=${JSON.stringify(BOOK_LAYOUTS)};${embeddedBookPresentationFunctions()}${bookPresentationScript('document')}`
  return frameDocument(`${view.flow}<script nonce="${options.nonce}">${script}</script>`, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: view.pagination.direction,
    lang: view.lang,
    css: bookStylesheet(options.fontCss, view.css, options.css),
    relayKeys: false,
    reportHeight: false,
  })
}
