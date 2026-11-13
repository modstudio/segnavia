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
  printedPageGeometries,
  regionOverflowRefusalEnabled,
  resolveLimits,
  resolveLineNumbers,
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
  printedSectionOutlineHtml,
  resolvePrintedPageHtml,
  TARGET_LINKS_CSS,
} from '@segnavia/html'
import { type ComposerPageGeometry, composerPageRules } from './book-page-geometries.ts'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { COMPOSE_FAILURE_ATTRIBUTE, COMPOSED_ATTRIBUTE, COMPOSER_SCRIPT, composerScript, GALLEY_PRINT_CSS, type ScreenPresentation } from './composer.ts'
import { COMPOSE_PROGRESS_ATTRIBUTE } from './composer-progress.ts'
import { refuseNamedDocumentBrand } from './document-brand-refusal.ts'
import { declaredFontLoads } from './font-load.ts'
import type { LoadedLayoutScript } from './layout.ts'
import { LINE_NUMBER_BASE_CSS, SIDE_NOTE_BASE_CSS } from './line-number-style.ts'
import { PrintedPagesRefusedError, printedPageGeometry } from './printed-page-geometry.ts'

export type { PageOrPrintedInput } from '@segnavia/format'

function onlyImplicitSection(sections: PrintedHtmlPage['printedPages']['sections']) {
  const section = sections[0]
  return sections.length === 1 && section?.implicit === true && section.pages === undefined ? section : undefined
}

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
  const geometries: ComposerPageGeometry[] = printedPageGeometries(page).map((geometry, index) => {
    const measured = printedPageGeometry(page, geometry.parents, geometry.paper.width, geometry.paper.height, geometry.name)
    const parents = geometry.parents.map((parent) => {
      const margin = Object.fromEntries(Object.entries(parent.margin).map(([key, value]) => [key, value * PX_PER_MM])) as typeof parent.margin
      return { ...parent, margin, textArea: textArea({ margin }, { width: measured.paperWidth, height: measured.paperHeight }) }
    })
    return {
      ...measured,
      name: geometry.name,
      pageName: `segnavia-page-${index + 1}`,
      paper: geometry.paper,
      columnGap: geometry.columns.gap * PX_PER_MM,
      columnCount: geometry.columns.count,
      parents,
    }
  })
  const direction = printedPageDirection(page)
  const numbering = page.printedPages.numbering ?? defaultPageNumbering(page.lang)
  const limits = resolveLimits(page.limits, options.limits)
  const parentRules: ParentRules = page.printedPages.parentRules
  const singleGeometry = geometries.length === 1 ? geometries[0] : undefined
  const pageRules = singleGeometry
    ? `@page{size:${singleGeometry.paper.width}mm ${singleGeometry.paper.height}mm;margin:0}`
    : composerPageRules(geometries)
  const baseCss = `${pageRules}:where(html,body){margin:0!important;padding:0!important}:where(html:not([${COMPOSED_ATTRIBUTE}]),html:not([${COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}:where([data-segnavia-flow]){position:absolute}:where([data-segnavia-pages]){inline-size:${Math.max(...geometries.map((geometry) => geometry.paper.width))}mm}:where([data-segnavia-printed-page]:last-child){break-after:auto}${GALLEY_PRINT_CSS}${LINE_NUMBER_BASE_CSS}${page.printedPages.sideNotes === undefined ? '' : SIDE_NOTE_BASE_CSS}${TARGET_LINKS_CSS}${fragmentationCss(page.printedPages.fragmentation)}${options.baseCss ?? ''}`
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
    geometries: singleGeometry
      ? [{ paperWidth: singleGeometry.paperWidth, paperHeight: singleGeometry.paperHeight, textWidth: singleGeometry.textWidth, textHeight: singleGeometry.textHeight, firstHeight: singleGeometry.firstHeight, columnGap: 0, parents: singleGeometry.parents }]
      : geometries,
    notesGap: 0,
    orphans: 2,
    widows: 2,
    rectoOpenings: false,
    endnotePlacement: 'chapter',
    variables: withLibraryEntries(LIBRARY_VARIABLES, page.printedPages.variables),
    headTemplates: withLibraryEntries(LIBRARY_HEAD_TEMPLATES, page.printedPages.headTemplates),
    recordSlotsByFlow: Object.fromEntries(page.printedPages.sections.map((section) => [section.id, section.pages === undefined ? (section.values ?? {}) : {}])),
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
  const parts = sections.map((section) => (section.pages ? section.pages.map((held) => pageParts(held.html)) : [pageParts(section.html)]))
  const normalizedSections = sections.map((section, index) =>
    section.pages
      ? { ...section, pages: section.pages.map((held, pageIndex) => ({ html: parts[index]?.[pageIndex]?.body ?? held.html })) }
      : { ...section, html: parts[index]?.[0]?.body ?? section.html },
  )
  const implicit = onlyImplicitSection(sections)
  const flows = implicit
    ? `<div data-segnavia-flow="${implicit.id}" data-segnavia-parent-rules="${JSON.stringify(parentRules).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${printedSectionOutlineHtml({ ...implicit, html: parts[0]?.[0]?.body ?? '' })}</div>`
    : printedSectionFlows(normalizedSections, parentRules)
  const flow = `<div data-segnavia-galleys>${flows}</div>`
  const body = `${parts
    .flat()
    .map((part) => part.head)
    .join('')}${flow}<script nonce="${options.nonce}">${composerScript(json)}</script>`
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
