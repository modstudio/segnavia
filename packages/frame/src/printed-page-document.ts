import {
  type DocumentInput,
  DocumentMetadata,
  type DocumentMetadata as DocumentMetadataValue,
  defaultPageNumbering,
  divisionNumbering,
  type FontFailure,
  LIBRARY_HEAD_TEMPLATES,
  LIBRARY_VARIABLES,
  LIMIT_ACTUAL_PLACEHOLDER,
  type Limits,
  limitRefusalTemplate,
  type NumberSystem,
  type OriginApproval,
  type Page,
  type ParentRules,
  PX_PER_MM,
  preflightEnabled,
  printedFromDocument,
  regionOverflowRefusalEnabled,
  resolveLimits,
  resolveLineNumbers,
  resolveParentPages,
  sheetMm,
  textArea,
  withLibraryEntries,
} from '@segnavia/format'
import {
  fragmentationCss,
  type HtmlPage,
  isPrintedHtmlPage,
  type PrintedHtmlPage,
  parseDocument,
  printedPageDirection,
  printedSectionFlows,
  resolvePrintedPageHtml,
} from '@segnavia/html'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { COMPOSE_FAILURE_ATTRIBUTE, COMPOSED_ATTRIBUTE, COMPOSER_SCRIPT, composerScript, GALLEY_PRINT_CSS, type ScreenPresentation } from './composer.ts'
import { COMPOSE_PROGRESS_ATTRIBUTE } from './composer-progress.ts'
import { withDiagramScript } from './diagram-document.ts'
import { refuseNamedDocumentBrand } from './document-brand-refusal.ts'
import { declaredFontLoads } from './font-load.ts'
import type { LoadedLayoutScript } from './layout.ts'
import { LINE_NUMBER_BASE_CSS, SIDE_NOTE_BASE_CSS } from './line-number-style.ts'
import { PrintedPagesRefusedError, printedPageGeometry } from './printed-page-geometry.ts'

export type { PageOrPrintedInput } from '@segnavia/format'
export {
  COMPOSE_FAILURE_ATTRIBUTE as PRINTED_PAGE_FAILURE_ATTRIBUTE,
  COMPOSED_ATTRIBUTE as PRINTED_PAGE_COMPOSED_ATTRIBUTE,
} from './composer.ts'
export { PREFLIGHT_ATTRIBUTE } from './composer-preflight.ts'

export { PrintedPagesRefusedError }

function printedMarginSettings(page: PrintedHtmlPage, system: NumberSystem) {
  const lineNumbers = page.printedPages.lineNumbers
  const sideNotes = page.printedPages.sideNotes
  return {
    ...(lineNumbers === undefined ? {} : { lineNumbers: resolveLineNumbers(lineNumbers, system) }),
    ...(sideNotes === undefined ? {} : { sideNotes }),
  }
}

function printedHeightReporting(options: { measure?: boolean; screen?: ScreenPresentation }): boolean | 'body' {
  if (options.measure === true) return true
  return options.screen ? 'body' : false
}

function pageParts(html: string): { head: string; body: string } {
  if (!/<html\b|<body\b/i.test(html)) return { head: '', body: html }
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? ''
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? ''
  const safeHead = [...head.matchAll(/<(?:style\b[^>]*>[\s\S]*?<\/style\s*|link\b[^>]*|meta\b[^>]*)>/gi)].map((match) => match[0]).join('')
  return { head: safeHead, body }
}

export function printedPageDocument(input: DocumentInput, options: Parameters<typeof printedPageValueDocument>[1] & { newId?: () => string }): string {
  const document = parseDocument(input, { newId: options.newId })
  refuseNamedDocumentBrand(document, 'printedPageValueDocument')
  return printedPageValueDocument(resolvePrintedPageHtml(printedFromDocument(document)), options)
}

export function printedPageValueDocument(
  source: PrintedHtmlPage | Page | HtmlPage,
  options: {
    nonce: string
    baseCss?: string
    css?: string
    csp?: string
    only?: number
    expectedCount?: number
    measure?: boolean
    printBackground?: boolean
    diagramScript?: string
    layoutScripts?: readonly LoadedLayoutScript[]
    screen?: ScreenPresentation
    readyCallback?: string
    metadata?: DocumentMetadataValue
    limits?: Limits
    fontFailures?: FontFailure[]
    origins?: Iterable<OriginApproval>
    profile?: import('@segnavia/format').PreflightProfile
    preflightSeed?: import('@segnavia/format').PreflightEntry[]
    progress?: boolean
    progressCallback?: string
  },
): string {
  const page = isPrintedHtmlPage(source) ? source : resolvePrintedPageHtml(source)
  const progress = options.progress !== false
  const metadata = options.metadata === undefined ? undefined : DocumentMetadata.parse(options.metadata)
  if (!page.printedPages || !page.print) throw new PrintedPagesRefusedError('A composed page needs printedPages and print.paper.')
  const paper = sheetMm(page.print)
  const resolved = resolveParentPages(page.printedPages.parents)
  const measured = printedPageGeometry(page, resolved, paper.width, paper.height)
  const direction = printedPageDirection(page)
  const numbering = page.printedPages.numbering ?? defaultPageNumbering(page.lang)
  const limits = resolveLimits(page.limits, options.limits)
  const parents = resolved.map((parent) => {
    const margin = Object.fromEntries(Object.entries(parent.margin).map(([key, value]) => [key, value * PX_PER_MM])) as typeof parent.margin
    return {
      ...parent,
      margin,
      textArea: textArea({ margin }, { width: measured.paperWidth, height: measured.paperHeight }),
    }
  })
  const parentRules: ParentRules = page.printedPages.parentRules
  const baseCss = `@page{size:${paper.width}mm ${paper.height}mm;margin:0}:where(html,body){margin:0!important;padding:0!important}:where(html:not([${COMPOSED_ATTRIBUTE}]),html:not([${COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}:where([data-segnavia-flow]){position:absolute}:where([data-segnavia-pages]){inline-size:${paper.width}mm}:where([data-segnavia-printed-page]:last-child){break-after:auto}${GALLEY_PRINT_CSS}${LINE_NUMBER_BASE_CSS}${page.printedPages.sideNotes === undefined ? '' : SIDE_NOTE_BASE_CSS}${fragmentationCss(page.printedPages.fragmentation)}${options.baseCss ?? ''}`
  const preflightSeed = [...(options.preflightSeed ?? [])]
  const sheets = frameStyleSheets(
    page.style,
    page.brand,
    baseCss,
    options.profile && preflightEnabled(options.profile) ? { profile: options.profile, entries: preflightSeed } : undefined,
  )
  const config = {
    direction,
    dir: page.dir,
    lang: page.lang,
    geometries: [{ ...measured, columnGap: 0, parents }],
    notesGap: 0,
    orphans: 2,
    widows: 2,
    rectoOpenings: false,
    endnotePlacement: 'chapter',
    variables: withLibraryEntries(LIBRARY_VARIABLES, page.printedPages.variables),
    headTemplates: withLibraryEntries(LIBRARY_HEAD_TEMPLATES, page.printedPages.headTemplates),
    recordSlotsByFlow: Object.fromEntries(page.printedPages.sections.map((section) => [section.id, section.values ?? {}])),
    pageMarker: 'data-segnavia-printed-page',
    pageAttributes: ['data-segnavia-page-view'],
    refusalSubject: 'The printed page',
    limit: limits.pages,
    limitRefusal: {
      template: limitRefusalTemplate('pages', limits.pages, { pagesSource: limits.pagesSource }),
      placeholder: LIMIT_ACTUAL_PLACEHOLDER,
    },
    only: options.only ?? null,
    expectedCount: options.expectedCount ?? null,
    measure: options.measure ?? false,
    inlineOverflow: 'tile',
    numbering: divisionNumbering(undefined, { frontMatter: numbering, body: numbering }),
    ...printedMarginSettings(page, numbering),
    parentRules,
    fontLoads: declaredFontLoads(page.style?.fonts),
    ...(options.profile && preflightEnabled(options.profile) ? { preflight: options.profile, preflightSeed } : {}),
    ...(options.screen ? { presentation: options.screen } : {}),
    progress,
    overflowRefusal: regionOverflowRefusalEnabled(options.profile),
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const sections = page.printedPages.sections
  const parts = sections.map((section) => pageParts(section.html))
  const implicit = sections.length === 1 && sections[0]?.implicit === true
  const flows = implicit
    ? `<div data-segnavia-flow="${sections[0]?.id}" data-segnavia-parent-rules="${JSON.stringify(parentRules).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${parts[0]?.body ?? ''}</div>`
    : printedSectionFlows(
        sections.map((section, index) => ({ ...section, html: parts[index]?.body ?? '' })),
        parentRules,
      )
  const flow = `<div data-segnavia-galleys>${flows}</div>`
  const drawn = withDiagramScript(`${parts.map((part) => part.head).join('')}${flow}`, options.nonce, options.diagramScript)
  const body = `${drawn}<script nonce="${options.nonce}">${composerScript(json)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: direction,
    lang: page.lang,
    title: metadata?.title,
    sheets,
    css: options.css,
    csp: options.csp,
    relayKeys: false,
    reportHeight: printedHeightReporting(options),
    readyAfterAttribute: COMPOSED_ATTRIBUTE,
    failureAttribute: COMPOSE_FAILURE_ATTRIBUTE,
    progressAttribute: progress ? COMPOSE_PROGRESS_ATTRIBUTE : undefined,
    progressCallback: options.progressCallback,
    bridgeForHost: true,
    printBackground: options.printBackground,
    readyCallback: options.readyCallback,
    fontFailures: options.fontFailures,
    origins: options.origins,
    layoutScripts: options.layoutScripts,
  })
}

export { COMPOSER_SCRIPT }
