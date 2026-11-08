import {
  type DocumentInput,
  DocumentMetadata,
  type DocumentMetadata as DocumentMetadataValue,
  defaultPageNumbering,
  LIMIT_ACTUAL_PLACEHOLDER,
  type Limits,
  limitRefusalTemplate,
  type Page,
  PX_PER_MM,
  pageDirection,
  printedFromDocument,
  type ResolvedParentPage,
  resolveLimits,
  resolveParentPages,
  sheetMm,
} from '@segnavia/format'
import { fragmentationCss, type HtmlPage, parseDocument, resolvePageHtml } from '@segnavia/html'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import { refuseNamedDocumentBrand } from './document-brand-refusal.ts'
import { COMPOSE_FAILURE_ATTRIBUTE, COMPOSED_ATTRIBUTE, COMPOSER_SCRIPT, composerScript, GALLEY_PRINT_CSS } from './composer.ts'
import { withDiagramScript } from './diagram-document.ts'

export type { PageOrPrintedInput } from '@segnavia/format'
export { COMPOSE_FAILURE_ATTRIBUTE as PRINTED_PAGE_FAILURE_ATTRIBUTE, COMPOSED_ATTRIBUTE as PRINTED_PAGE_COMPOSED_ATTRIBUTE } from './composer.ts'

export class PrintedPagesRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrintedPagesRefusedError'
  }
}

interface Geometry {
  paperWidth: number
  paperHeight: number
  textWidth: number
  textHeight: number
  firstHeight: number
}

function geometry(page: HtmlPage, parents: ResolvedParentPage[], width: number, height: number): Geometry {
  const printed = page.printedPages as NonNullable<Page['printedPages']>
  const byName = new Map(parents.map((parent) => [parent.name, parent]))
  const normal = byName.get(printed.rules.every) as ResolvedParentPage
  const textWidth = width - normal.margin.inlineStart - normal.margin.inlineEnd
  const textHeight = height - normal.margin.blockStart - normal.margin.blockEnd
  if (textWidth <= 0) {
    throw new PrintedPagesRefusedError(
      `Parent page "${normal.name}" could not establish a positive text width; reduce its inner plus outer margins to clear this refusal.`,
    )
  }
  if (textHeight <= 0) {
    throw new PrintedPagesRefusedError(
      `Parent page "${normal.name}" could not establish a positive text height; reduce its top plus bottom margins to clear this refusal.`,
    )
  }
  const roles = Object.entries(printed.rules).filter((entry): entry is [string, string] => entry[1] !== undefined)
  const names = [...new Set(roles.map(([, name]) => name))]
  for (const name of names) {
    const parent = byName.get(name) as ResolvedParentPage
    const candidateWidth = width - parent.margin.inlineStart - parent.margin.inlineEnd
    const candidateHeight = height - parent.margin.blockStart - parent.margin.blockEnd
    if (candidateWidth <= 0) {
      throw new PrintedPagesRefusedError(
        `Parent page "${name}" could not establish a positive text width; reduce its inner plus outer margins to clear this refusal.`,
      )
    }
    if (candidateHeight <= 0) {
      throw new PrintedPagesRefusedError(
        `Parent page "${name}" could not establish a positive text height; reduce its top plus bottom margins to clear this refusal.`,
      )
    }
    if (Math.abs(candidateWidth - textWidth) > 0.001) {
      throw new PrintedPagesRefusedError(
        `Parent pages "${normal.name}" and "${name}" could not establish one text width; make their inner plus outer margins equal to clear this refusal.`,
      )
    }
    const solelyFirst = roles.every(([role, used]) => used !== name || role === 'first')
    if (!solelyFirst && Math.abs(candidateHeight - textHeight) > 0.001) {
      throw new PrintedPagesRefusedError(
        `Parent pages "${normal.name}" and "${name}" could not establish one text height outside the first page; make their top plus bottom margins equal to clear this refusal.`,
      )
    }
  }
  const first = byName.get(printed.rules.first ?? printed.rules.every) as ResolvedParentPage
  const firstHeight = height - first.margin.blockStart - first.margin.blockEnd
  if (firstHeight <= 0) {
    throw new PrintedPagesRefusedError(
      `First parent page "${first.name}" could not establish a positive text height; reduce its top plus bottom margins to clear this refusal.`,
    )
  }
  if (firstHeight > textHeight + 0.001) {
    throw new PrintedPagesRefusedError(
      `First parent page "${first.name}" has a taller text height than "${normal.name}"; increase its top plus bottom margins to clear this refusal.`,
    )
  }
  const lastName = printed.rules.last
  if (lastName) {
    const last = byName.get(lastName) as ResolvedParentPage
    if (JSON.stringify(last.margin) !== JSON.stringify(normal.margin)) {
      throw new PrintedPagesRefusedError(
        `Last parent page "${last.name}" could not establish geometry independent of which page is last; give it the same margins as "${normal.name}" to clear this refusal.`,
      )
    }
  }
  return {
    paperWidth: width * PX_PER_MM,
    paperHeight: height * PX_PER_MM,
    textWidth: textWidth * PX_PER_MM,
    textHeight: textHeight * PX_PER_MM,
    firstHeight: firstHeight * PX_PER_MM,
  }
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
  return printedPageValueDocument(resolvePageHtml(printedFromDocument(document)), options)
}

export function printedPageValueDocument(
  page: HtmlPage,
  options: {
    nonce: string
    baseCss?: string
    css?: string
    only?: number
    expectedCount?: number
    measure?: boolean
    printBackground?: boolean
    diagramScript?: string
    readyCallback?: string
    metadata?: DocumentMetadataValue
    limits?: Limits
  },
): string {
  const metadata = options.metadata === undefined ? undefined : DocumentMetadata.parse(options.metadata)
  if (!page.printedPages || !page.print) throw new PrintedPagesRefusedError('A composed page needs printedPages and print.paper.')
  const paper = sheetMm(page.print)
  const resolved = resolveParentPages(page.printedPages.parents)
  const measured = geometry(page, resolved, paper.width, paper.height)
  const direction = pageDirection(page)
  const numbering = page.printedPages.numbering ?? defaultPageNumbering(page.lang)
  const limits = resolveLimits(page.limits, options.limits)
  const parents = resolved.map((parent) => {
    const margin = Object.fromEntries(Object.entries(parent.margin).map(([key, value]) => [key, value * PX_PER_MM])) as typeof parent.margin
    return {
      ...parent,
      margin,
      textArea: {
        width: measured.paperWidth - margin.inlineStart - margin.inlineEnd,
        height: measured.paperHeight - margin.blockStart - margin.blockEnd,
      },
    }
  })
  const rules = page.printedPages.rules
  const parentNames = {
    opener: rules.first ?? rules.every,
    recto: rules.recto ?? rules.every,
    verso: rules.verso ?? rules.every,
    blank: rules.every,
    fixed: rules.every,
  }
  const config = {
    direction,
    dir: page.dir,
    lang: page.lang,
    geometry: { ...measured, columnGap: 0, notesGap: 0 },
    orphans: 2,
    widows: 2,
    rectoOpenings: false,
    endnotePlacement: 'chapter',
    runningHead: {},
    parentNames,
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
    numbering,
    parents,
    rules,
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const baseCss = `@page{size:${paper.width}mm ${paper.height}mm;margin:0}:where(html,body){margin:0!important;padding:0!important}:where(html:not([${COMPOSED_ATTRIBUTE}]),html:not([${COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}:where([data-segnavia-flow]){position:absolute}:where([data-segnavia-pages]){inline-size:${paper.width}mm}:where([data-segnavia-printed-page]:last-child){break-after:auto}${GALLEY_PRINT_CSS}${fragmentationCss(page.printedPages.fragmentation)}${options.baseCss ?? ''}`
  const parts = pageParts(page.html)
  const flow = `<div data-segnavia-galleys><div data-segnavia-flow="printed-page" data-parent-opener="${parentNames.opener}" data-parent-recto="${parentNames.recto}" data-parent-verso="${parentNames.verso}">${parts.body}</div></div>`
  const drawn = withDiagramScript(`${parts.head}${flow}`, options.nonce, options.diagramScript)
  const body = `${drawn}<script nonce="${options.nonce}">${composerScript(json)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: direction,
    lang: page.lang,
    title: metadata?.title,
    sheets: frameStyleSheets(page.style, page.brand, baseCss),
    css: options.css,
    relayKeys: false,
    reportHeight: options.measure === true,
    readyAfterAttribute: COMPOSED_ATTRIBUTE,
    failureAttribute: COMPOSE_FAILURE_ATTRIBUTE,
    printBackground: options.printBackground,
    readyCallback: options.readyCallback,
  })
}

export { COMPOSER_SCRIPT }
