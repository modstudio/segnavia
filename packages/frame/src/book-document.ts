import {
  BOOK_PARENT_NAMES,
  type Book,
  bookParentPages,
  formatNumber,
  PRINTED_PAGE_LIMIT,
  PX_PER_MM,
  resolveDirection,
  resolveParentPages,
  sheetMm,
} from '@segnavia/format'
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
  if (book.mode !== 'paginated' || !book.page) {
    throw new PaginatedBookRefusedError('A paginated book document needs mode paginated and page; set both to clear this refusal.')
  }
  const built = htmlBookDocument(book)
  if (built.issues.length > 0) throw new PaginatedBookRefusedError(`The book cannot be printed: ${built.issues.join('; ')}.`)
  const paper = sheetMm(book.page)
  const direction = resolveDirection(book.dir, book.lang, book.title)
  const margin = book.page.margin
  const parents = resolveParentPages(bookParentPages(margin)).map((parent) => ({
    ...parent,
    margin: {
      top: px(parent.margin.top),
      bottom: px(parent.margin.bottom),
      inner: px(parent.margin.inner),
      outer: px(parent.margin.outer),
    },
  }))
  const config = {
    direction,
    dir: book.dir,
    lang: book.lang,
    geometry: {
      paperWidth: px(paper.width),
      paperHeight: px(paper.height),
      textWidth: px(paper.width - margin.inner - margin.outer),
      textHeight: px(paper.height - margin.top - margin.bottom),
      columnGap: px(book.page.columnGap),
      notesGap: 9,
    },
    orphans: book.orphans,
    widows: book.widows,
    rectoOpenings: book.rectoOpenings,
    endnotePlacement: book.endnotes.placement,
    runningHead: book.runningHead,
    contentsPageNumbers: book.contents.pageNumbers,
    parents,
    parentNames: BOOK_PARENT_NAMES,
    folios: { front: folios(book.numbering.frontMatter), body: folios(book.numbering.body) },
    limit: PRINTED_PAGE_LIMIT,
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const css =
    `@page{size:${paper.width}mm ${paper.height}mm;margin:0}` +
    `:where(html,body){margin:0!important;padding:0!important}` +
    `:where(html:not([${BOOK_COMPOSED_ATTRIBUTE}]),html:not([${BOOK_COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}` +
    `:where([data-segnavia-galleys]){position:absolute;inset-block-start:0;inset-inline-start:0}` +
    `:where([data-segnavia-pages]){inline-size:${paper.width}mm}` +
    `:where([data-segnavia-book-page]:last-child){break-after:auto}` +
    `@media print{:where([data-segnavia-galley-source]){display:none!important}}` +
    (options.css ?? '')
  const body = `${built.html}<script nonce="${options.nonce}">${composerScript(json)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: direction,
    lang: book.lang,
    css,
    relayKeys: false,
    reportHeight: false,
    readyAfterAttribute: BOOK_COMPOSED_ATTRIBUTE,
    printBackground: options.printBackground,
  })
}

export const BOOK_COMPOSER_SCRIPT = composerScript('{}')
