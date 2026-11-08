import {
  BOOK_PARENT_NAMES,
  type BookView,
  type BookViewPagination,
  LIMIT_ACTUAL_PLACEHOLDER,
  type Limits,
  limitRefusalTemplate,
  PX_PER_MM,
  resolveLimits,
  resolveParentPages,
  textArea,
} from '@segnavia/format'
import { BOOK_COMPOSED_ATTRIBUTE, BOOK_FAILURE_ATTRIBUTE, composerScript } from './book-composer.ts'
import { BOOK_LAYOUTS, bookPresentationScript, embeddedBookPresentationFunctions } from './book-presentation.ts'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { withDiagramScript } from './diagram-document.ts'

export interface PaginatedDocumentOptions {
  nonce: string
  fontCss?: string
  css?: string
  printBackground?: boolean
  screen?: { spread: boolean }
  diagramScript?: string
  limits?: Limits
}

function px(value: number): number {
  return value * PX_PER_MM
}

export function paginatedViewDocument(view: BookView, pagination: BookViewPagination, options: PaginatedDocumentOptions): string {
  const limits = resolveLimits(view.limits, options.limits)
  const paper = { width: px(pagination.paper.width), height: px(pagination.paper.height) }
  const parents = resolveParentPages(pagination.parents).map((parent) => {
    const margin = {
      blockStart: px(parent.margin.blockStart),
      blockEnd: px(parent.margin.blockEnd),
      inlineStart: px(parent.margin.inlineStart),
      inlineEnd: px(parent.margin.inlineEnd),
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
    parents,
    parentNames: BOOK_PARENT_NAMES,
    numbering: pagination.numbering,
    limit: limits.pages,
    limitRefusal: {
      template: limitRefusalTemplate('pages', limits.pages, { pagesSource: limits.pagesSource }),
      placeholder: LIMIT_ACTUAL_PLACEHOLDER,
    },
    ...(options.screen ? { screen: options.screen } : {}),
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const baseCss =
    `@page{size:${pagination.paper.width}mm ${pagination.paper.height}mm;margin:0}` +
    `:where(html,body){margin:0!important;padding:0!important}` +
    `:where(html:not([${BOOK_COMPOSED_ATTRIBUTE}]),html:not([${BOOK_COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}` +
    `:where([data-segnavia-galleys]){position:absolute;inset-block-start:0;inset-inline-start:0}` +
    `:where([data-segnavia-pages]){inline-size:${pagination.paper.width}mm}` +
    `:where([data-segnavia-book-page]:last-child){break-after:auto}` +
    `@media print{:where([data-segnavia-galley-source]){display:none!important}}` +
    (options.fontCss ?? '')
  const drawn = withDiagramScript(view.html, options.nonce, options.diagramScript)
  const body = `${drawn}<script nonce="${options.nonce}">${composerScript(json, options.screen !== undefined)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: pagination.direction,
    lang: view.lang,
    sheets: frameStyleSheets(view.style, pagination.direction, baseCss),
    css: options.css,
    relayKeys: false,
    reportHeight: false,
    readyAfterAttribute: BOOK_COMPOSED_ATTRIBUTE,
    failureAttribute: BOOK_FAILURE_ATTRIBUTE,
    printBackground: options.printBackground,
  })
}

export function flowViewDocument(view: BookView, options: Pick<PaginatedDocumentOptions, 'nonce' | 'fontCss' | 'css' | 'diagramScript'>): string {
  if (!view.flow || !view.pagination) throw new Error('A flow frame requires a paginated view built with its flow.')
  const script = `var BOOK_LAYOUTS=${JSON.stringify(BOOK_LAYOUTS)};${embeddedBookPresentationFunctions()}${bookPresentationScript('document')}`
  return frameDocument(`${withDiagramScript(view.flow, options.nonce, options.diagramScript)}<script nonce="${options.nonce}">${script}</script>`, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: view.pagination.direction,
    lang: view.lang,
    sheets: frameStyleSheets(view.style, view.pagination.direction, options.fontCss),
    css: options.css,
    relayKeys: false,
    reportHeight: false,
  })
}
