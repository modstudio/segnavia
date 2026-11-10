import {
  type BookView,
  type BookViewPagination,
  LIMIT_ACTUAL_PLACEHOLDER,
  type Limits,
  limitRefusalTemplate,
  type Plan,
  type PreflightProfile,
  resolveLimits,
} from '@segnavia/format'
import { composerPageGeometries, composerPageRules } from './book-page-geometries.ts'
import { BOOK_LAYOUTS, BOOK_PAGE_ATTRIBUTE, bookPresentationScript, embeddedBookPresentationFunctions } from './book-presentation.ts'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { COMPOSE_FAILURE_ATTRIBUTE, COMPOSED_ATTRIBUTE, composerScript, GALLEY_PRINT_CSS, type ScreenPresentation } from './composer.ts'
import { withDiagramScript } from './diagram-document.ts'
import { declaredFontLoads } from './font-load.ts'

export interface PaginatedDocumentOptions {
  nonce: string
  fontCss?: string
  css?: string
  printBackground?: boolean
  screen?: Omit<ScreenPresentation, 'reportPlace'>
  diagramScript?: string
  limits?: Limits
  plan?: Plan
  breaks?: string[]
  profile?: PreflightProfile
}

export function paginatedViewDocument(view: BookView, pagination: BookViewPagination, options: PaginatedDocumentOptions): string {
  const fonts = view.style?.fonts
  const limits = resolveLimits(view.limits, options.limits)
  const geometries = composerPageGeometries(pagination)
  const geometry = geometries[0]
  if (!geometry) throw new Error('A paginated book needs a default page geometry.')
  const config = {
    direction: pagination.direction,
    dir: view.dir,
    lang: view.lang,
    geometries,
    notesGap: 9,
    orphans: pagination.orphans,
    widows: pagination.widows,
    rectoOpenings: pagination.rectoOpenings,
    endnotePlacement: pagination.endnotePlacement,
    runningHead: pagination.runningHead,
    variables: pagination.variables ?? [],
    numbering: pagination.numbering,
    limit: limits.pages,
    limitRefusal: {
      template: limitRefusalTemplate('pages', limits.pages, { pagesSource: limits.pagesSource }),
      placeholder: LIMIT_ACTUAL_PLACEHOLDER,
    },
    pageMarker: BOOK_PAGE_ATTRIBUTE,
    refusalSubject: 'The book',
    only: null,
    expectedCount: null,
    measure: false,
    savedPlans: true,
    fontLoads: declaredFontLoads(fonts),
    ...(options.profile && Object.values(options.profile).some((severity) => severity !== 'off') ? { preflight: options.profile } : {}),
    ...(options.screen ? { presentation: { ...options.screen, reportPlace: true } } : {}),
    ...(options.plan === undefined ? {} : { plan: options.plan }),
    ...(options.breaks === undefined ? {} : { breaks: options.breaks }),
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const baseCss =
    composerPageRules(geometries) +
    `:where(html,body){margin:0!important;padding:0!important}` +
    `:where(html:not([${COMPOSED_ATTRIBUTE}]),html:not([${COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}` +
    `:where([data-segnavia-galleys]){position:absolute;inset-block-start:0;inset-inline-start:0}` +
    `:where([data-segnavia-pages]){inline-size:${Math.max(...pagination.geometries.map((item) => item.paper.width))}mm}` +
    `:where([${BOOK_PAGE_ATTRIBUTE}]:last-child){break-after:auto}` +
    GALLEY_PRINT_CSS +
    (options.fontCss ?? '')
  const drawn = withDiagramScript(view.html, options.nonce, options.diagramScript)
  const body = `${drawn}<script nonce="${options.nonce}">${composerScript(json)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: pagination.direction,
    lang: view.lang,
    sheets: frameStyleSheets(view.style, view.brand, baseCss),
    css: options.css,
    relayKeys: false,
    reportHeight: false,
    readyAfterAttribute: COMPOSED_ATTRIBUTE,
    failureAttribute: COMPOSE_FAILURE_ATTRIBUTE,
    printBackground: options.printBackground,
  })
}

export function flowViewDocument(view: BookView, options: Pick<PaginatedDocumentOptions, 'nonce' | 'fontCss' | 'css' | 'diagramScript'>): string {
  if (!view.flow || !view.pagination) throw new Error('A flow frame requires a paginated view built with its flow.')
  const script = `var BOOK_LAYOUTS=${JSON.stringify(BOOK_LAYOUTS)};${embeddedBookPresentationFunctions()}${bookPresentationScript('document', '', JSON.stringify(BOOK_PAGE_ATTRIBUTE))}`
  return frameDocument(`${withDiagramScript(view.flow, options.nonce, options.diagramScript)}<script nonce="${options.nonce}">${script}</script>`, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: view.pagination.direction,
    lang: view.lang,
    sheets: frameStyleSheets(view.style, view.brand, options.fontCss),
    css: options.css,
    relayKeys: false,
    reportHeight: false,
    fonts: view.style?.fonts,
  })
}
