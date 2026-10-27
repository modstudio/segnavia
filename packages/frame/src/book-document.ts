import { BOOK_PARENT_NAMES, type Book, formatNumber, PRINTED_PAGE_LIMIT, PX_PER_MM, resolveBookPagination, resolveParentPages } from '@segnavia/format'
import { bookDocument as htmlBookDocument } from '@segnavia/html'
import { BOOK_COMPOSED_ATTRIBUTE, composerScript } from './book-composer.ts'
import { frameDocument } from './bridge.ts'

export { BOOK_COMPOSED_ATTRIBUTE, BOOK_FAILURE_ATTRIBUTE } from './book-composer.ts'

export class PaginatedBookRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaginatedBookRefusedError'
  }
}

function px(value: number): number {
  return value * PX_PER_MM
}

function folios(system: Book['numbering']['body']): string[] {
  return Array.from({ length: PRINTED_PAGE_LIMIT }, (_, index) => formatNumber(index + 1, system))
}

export function bookDocument(book: Book, options: { nonce: string; css?: string; printBackground?: boolean }): string {
  const pagination = resolveBookPagination(book)
  if (!pagination) {
    throw new PaginatedBookRefusedError('A paginated book document needs mode paginated and page; set both to clear this refusal.')
  }
  const built = htmlBookDocument(book)
  if (built.issues.length > 0) throw new PaginatedBookRefusedError(`The book cannot be printed: ${built.issues.join('; ')}.`)
  const parents = resolveParentPages(pagination.parents).map((parent) => ({
    ...parent,
    margin: {
      top: px(parent.margin.top),
      bottom: px(parent.margin.bottom),
      inner: px(parent.margin.inner),
      outer: px(parent.margin.outer),
    },
  }))
  const config = {
    direction: pagination.direction,
    dir: book.dir,
    lang: book.lang,
    geometry: {
      paperWidth: px(pagination.paper.width),
      paperHeight: px(pagination.paper.height),
      textWidth: px(pagination.paper.width - pagination.margin.inner - pagination.margin.outer),
      textHeight: px(pagination.paper.height - pagination.margin.top - pagination.margin.bottom),
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
    parentNames: BOOK_PARENT_NAMES,
    folios: { front: folios(pagination.numbering.frontMatter), body: folios(pagination.numbering.body) },
    limit: PRINTED_PAGE_LIMIT,
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const css =
    `@page{size:${pagination.paper.width}mm ${pagination.paper.height}mm;margin:0}` +
    `:where(html,body){margin:0!important;padding:0!important}` +
    `:where(html:not([${BOOK_COMPOSED_ATTRIBUTE}]),html:not([${BOOK_COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}` +
    `:where([data-segnavia-galleys]){position:absolute;inset-block-start:0;inset-inline-start:0}` +
    `:where([data-segnavia-pages]){inline-size:${pagination.paper.width}mm}` +
    `:where([data-segnavia-book-page]:last-child){break-after:auto}` +
    `@media print{:where([data-segnavia-galley-source]){display:none!important}}` +
    (options.css ?? '')
  const body = `${built.html}<script nonce="${options.nonce}">${composerScript(json)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: pagination.direction,
    lang: book.lang,
    css,
    relayKeys: false,
    reportHeight: false,
    readyAfterAttribute: BOOK_COMPOSED_ATTRIBUTE,
    printBackground: options.printBackground,
  })
}

export const BOOK_COMPOSER_SCRIPT = composerScript('{}')
