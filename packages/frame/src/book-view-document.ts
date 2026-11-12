import {
  type BookView,
  type BookViewPagination,
  LIBRARY_HEAD_TEMPLATES,
  LIBRARY_VARIABLES,
  LIMIT_ACTUAL_PLACEHOLDER,
  type Limits,
  limitRefusalTemplate,
  type Plan,
  type PreflightEntry,
  type PreflightProfile,
  preflightEnabled,
  regionOverflowRefusalEnabled,
  resolveLimits,
  withLibraryEntries,
} from '@segnavia/format'
import { composerPageGeometries, composerPageRules } from './book-page-geometries.ts'
import { BOOK_LAYOUTS, BOOK_PAGE_ATTRIBUTE, bookPresentationScript, embeddedBookPresentationFunctions } from './book-presentation.ts'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { COMPOSE_FAILURE_ATTRIBUTE, COMPOSED_ATTRIBUTE, composerScript, GALLEY_PRINT_CSS, type ScreenPresentation } from './composer.ts'
import { LINE_NUMBER_CSS } from './composer-margin.ts'
import { COMPOSE_PROGRESS_ATTRIBUTE } from './composer-progress.ts'
import { withDiagramScript } from './diagram-document.ts'
import { declaredFontLoads } from './font-load.ts'
import type { LoadedLayoutScript } from './layout.ts'

export interface PaginatedDocumentOptions {
  nonce: string
  fontCss?: string
  css?: string
  printBackground?: boolean
  screen?: Omit<ScreenPresentation, 'reportPlace'>
  diagramScript?: string
  layoutScripts?: readonly LoadedLayoutScript[]
  limits?: Limits
  plan?: Plan
  breaks?: string[]
  profile?: PreflightProfile
  preflightSeed?: PreflightEntry[]
  progress?: boolean
  progressCallback?: string
}

export function paginatedViewDocument(view: BookView, pagination: BookViewPagination, options: PaginatedDocumentOptions): string {
  const progress = options.progress !== false
  const fonts = view.style?.fonts
  const limits = resolveLimits(view.limits, options.limits)
  const geometries = composerPageGeometries(pagination)
  const geometry = geometries[0]
  if (!geometry) throw new Error('A paginated book needs a default page geometry.')
  const baseCss =
    composerPageRules(geometries) +
    `:where(html,body){margin:0!important;padding:0!important}` +
    `:where(html:not([${COMPOSED_ATTRIBUTE}]),html:not([${COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}` +
    `:where([data-segnavia-galleys]){position:absolute;inset-block-start:0;inset-inline-start:0}` +
    `:where([data-segnavia-pages]){inline-size:${Math.max(...pagination.geometries.map((item) => item.paper.width))}mm}` +
    `:where([${BOOK_PAGE_ATTRIBUTE}]:last-child){break-after:auto}` +
    GALLEY_PRINT_CSS +
    LINE_NUMBER_CSS +
    (options.fontCss ?? '')
  const regionProfile = options.profile
  const preflightSeed = [...(options.preflightSeed ?? [])]
  const sheets = frameStyleSheets(
    view.style,
    view.brand,
    baseCss,
    regionProfile && preflightEnabled(regionProfile) ? { profile: regionProfile, entries: preflightSeed } : undefined,
  )
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
    variables: withLibraryEntries(LIBRARY_VARIABLES, pagination.variables),
    ...(pagination.document === undefined ? {} : { document: pagination.document }),
    headTemplates: withLibraryEntries(LIBRARY_HEAD_TEMPLATES, pagination.headTemplates),
    recordSlotsByFlow: pagination.recordSlotsByFlow ?? {},
    numbering: pagination.numbering,
    ...(pagination.lineNumbers === undefined
      ? {}
      : { lineNumbers: { ...pagination.lineNumbers, system: pagination.lineNumbers.system ?? pagination.numbering.body } }),
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
    ...(regionProfile && preflightEnabled(regionProfile) ? { preflight: regionProfile, preflightSeed } : {}),
    ...(options.screen ? { presentation: { ...options.screen, reportPlace: true } } : {}),
    progress,
    overflowRefusal: regionOverflowRefusalEnabled(options.profile),
    ...(options.plan === undefined ? {} : { plan: options.plan }),
    ...(options.breaks === undefined ? {} : { breaks: options.breaks }),
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const drawn = withDiagramScript(view.html, options.nonce, options.diagramScript)
  const body = `${drawn}<script nonce="${options.nonce}">${composerScript(json)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: pagination.direction,
    lang: view.lang,
    sheets,
    css: options.css,
    relayKeys: false,
    reportHeight: false,
    readyAfterAttribute: COMPOSED_ATTRIBUTE,
    failureAttribute: COMPOSE_FAILURE_ATTRIBUTE,
    progressAttribute: progress ? COMPOSE_PROGRESS_ATTRIBUTE : undefined,
    progressCallback: options.progressCallback,
    bridgeForHost: true,
    printBackground: options.printBackground,
    layoutScripts: options.layoutScripts,
  })
}

export function flowViewDocument(
  view: BookView,
  options: Pick<PaginatedDocumentOptions, 'nonce' | 'fontCss' | 'css' | 'diagramScript' | 'layoutScripts'>,
): string {
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
    layoutScripts: options.layoutScripts,
  })
}
