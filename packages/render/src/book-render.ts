import {
  type AsOfDay,
  type Book,
  bookPageGeometries,
  type ComposeProgress,
  type FontFailure,
  KEEP_WITH_CUSTOM_PROPERTY,
  type Limits,
  type OriginApproval,
  Plan,
  type PreflightEntry,
  type PreflightProfile,
  PX_PER_MM,
  pressBoxes,
  resolveBookPageGeometry,
  resolveDirection,
  type Plan as SavedPlan,
  sheetMm,
  usesPressLayout,
} from '@segnavia/format'
import {
  BOOK_COMPOSED_ATTRIBUTE,
  BOOK_FAILURE_ATTRIBUTE,
  PaginatedBookRefusedError,
  bookValueDocument as paginatedBookDocument,
} from '@segnavia/frame/book-document'
import { frameDocument, frameStyleSheets, newNonce, StyleSheetRefusedError } from '@segnavia/frame/bridge'
import { hasDiagram, withDiagramScript } from '@segnavia/frame/diagrams'
import type { LoadedLayoutScript } from '@segnavia/frame/layout'
import { bookDocument, type PreparedSlots } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import { bookPageCss, renderBookPdf } from './book-pdf.ts'
import { writePlanFolios } from './book-structure.ts'
import { fontLoadSetup } from './browser-tab.ts'
import { resolveDiagramScript } from './diagram-script.ts'
import { layoutScripts } from './layout-scripts.ts'
import { RenderRefusedError } from './errors.ts'
import { type Assets, assetSetup, type RenderOptions, refuseProgressUnlessOneComposition } from './options.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'
import { addPressBoxesByPage } from './page-paper.ts'
import { loadPdf } from './pdf-load.ts'
import { pagePdfSize, setPdfPageSizes } from './pdf-page-size.ts'
import { awaitPreflightReport } from './preflight.ts'
import { renderProgressDocumentOptions } from './progress.ts'
import { RENDER_READY_BINDING, type RenderReadiness, renderReadiness } from './render-readiness.ts'
import type { BookPlanOptions, ParsedBookPdfOptions } from './renderer.ts'
import { slotsForDocument } from './slot-document.ts'
import { bookSlotFrames, fillBookForDay } from './slot-fill.ts'

export async function awaitBookComposition(tab: Tab, preflight?: ParsedBookPdfOptions['preflight']): Promise<void> {
  await tab.waitForFunction(({ composed, failed }) => document.documentElement.hasAttribute(composed) || document.documentElement.hasAttribute(failed), {
    composed: BOOK_COMPOSED_ATTRIBUTE,
    failed: BOOK_FAILURE_ATTRIBUTE,
  })
  await awaitPreflightReport(tab, preflight)
  const failure = await tab.evaluate((attribute) => document.documentElement.getAttribute(attribute), BOOK_FAILURE_ATTRIBUTE)
  if (failure) throw new RenderRefusedError(failure)
}

interface TabSetup {
  viewport: { width: number; height: number }
  scripts: boolean
  html: string
  readiness: RenderReadiness
  boundMs?: number
  beforeOutput?: (tab: Tab) => Promise<void>
  slots?: PreparedSlots
  origins?: Iterable<OriginApproval>
  assets?: Assets
  limits?: Limits
  fontFailures?: FontFailure[]
  fontLoadReport?: (report: { failures: FontFailure[] }) => void
  progressReport?: (progress: ComposeProgress) => void
}

export interface BrowserBookDependencies {
  render(setup: TabSetup, pdf: Parameters<Tab['pdf']>[0], pageWidth: number, part: BookOverflowPart): Promise<PrintResult<true>>
  fontFaces(options: RenderOptions): string
  finish(pdf: Uint8Array, options: RenderOptions): Promise<Uint8Array>
  fontFailures?: FontFailure[]
}

// A chapter can author its own plan carrier, so the composer's published one is the last.
// The tab evaluates this function's source, so the zero-argument overload is the one it calls.
export function lastBookPlanText(): string | null | undefined
export function lastBookPlanText(root: ParentNode): string | null | undefined
export function lastBookPlanText(root: ParentNode = document): string | null | undefined {
  return Array.from(root.querySelectorAll('script[data-segnavia-plan]')).at(-1)?.textContent
}

export async function composedPlanFromTab(tab: Tab, limits: Limits | undefined): Promise<SavedPlan> {
  const text = await tab.evaluate(lastBookPlanText)
  try {
    return Plan.parse(JSON.parse(text ?? 'null'), { limits })
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}

/** Whether author markup or any author stylesheet declares a keep, which only the bridge's keep pass applies. */
export function usesKeepWith(...sources: Array<string | undefined>): boolean {
  return sources.some((source) => source?.includes(KEEP_WITH_CUSTOM_PROPERTY) === true)
}

export function continuousBookNeedsScripts(
  html: string,
  sheets: readonly string[],
  hostCss: string | undefined,
  scripts: Book['scripts'],
  marginLayer: boolean,
): boolean {
  return (!marginLayer && scripts === 'sandboxed') || hasDiagram(html) || usesKeepWith(html, ...sheets, hostCss)
}

function bookSrcdoc(
  html: string,
  book: Book,
  fontCss: string,
  baseCss: string,
  hostCss: string | undefined,
  marginLayer: boolean,
  diagramScript: string | undefined,
  resolvedLayoutScripts: readonly LoadedLayoutScript[],
  options: {
    sheets?: readonly string[]
    origins?: Iterable<OriginApproval>
    limits?: Limits
    plan?: SavedPlan
    breaks?: string[]
    profile?: PreflightProfile
    preflightSeed?: PreflightEntry[]
    progress?: boolean
    progressCallback?: string
  },
): string {
  const nonce = newNonce()
  if (book.mode === 'paginated')
    return paginatedBookDocument(book, {
      nonce,
      fontCss: `${fontCss}${baseCss}`,
      css: hostCss,
      printBackground: true,
      diagramScript,
      layoutScripts: resolvedLayoutScripts,
      limits: options.limits,
      plan: options.plan,
      breaks: options.breaks ?? options.plan?.breaks,
      profile: options.profile,
      preflightSeed: options.preflightSeed,
      progress: options.progress,
      progressCallback: options.progressCallback,
    })
  return frameDocument(withDiagramScript(html, nonce, diagramScript), {
    scripts: marginLayer ? 'refuse' : book.scripts,
    nonce,
    dir: marginLayer ? 'ltr' : resolveDirection(book.dir, book.lang, book.title),
    lang: book.lang,
    sheets: options.sheets,
    css: hostCss,
    relayKeys: false,
    reportHeight: false,
    origins: options.origins,
    readyCallback: hasDiagram(html) ? RENDER_READY_BINDING : undefined,
    layoutScripts: resolvedLayoutScripts,
  })
}

function paginatedBookTabSetup(book: Book, html: string, slots: PreparedSlots, options: RenderOptions): TabSetup {
  if (!book.page) throw new RenderRefusedError('Printing a book needs page; set page before calling bookPdf.')
  const sizes = bookPageGeometries(book).map((geometry) =>
    book.print && usesPressLayout(book.print) ? pressBoxes(geometry.paper, book.print).bleedBox : geometry.paper,
  )
  const size = {
    width: Math.max(...sizes.map((candidate) => candidate.width)),
    height: Math.max(...sizes.map((candidate) => candidate.height)),
  }
  return {
    viewport: { width: Math.round(size.width * PX_PER_MM), height: Math.round(size.height * PX_PER_MM) },
    scripts: true,
    html,
    slots,
    readiness: renderReadiness('refuse', false, false),
    boundMs: options.boundMs,
    ...assetSetup(options),
    progressReport: options.progress?.report,
  }
}

function paginatedBookWidth(book: Book): number {
  const widths = bookPageGeometries(book).map((geometry) =>
    book.print && usesPressLayout(book.print) ? pressBoxes(geometry.paper, book.print).bleedBox.width : geometry.paper.width,
  )
  return Math.max(...widths)
}

// Building a book's document can refuse its pagination or its style sheet;
// both reach the host as a render refusal.
function refusedAsRender<T>(build: () => T): T {
  try {
    return build()
  } catch (error) {
    if (error instanceof PaginatedBookRefusedError || error instanceof StyleSheetRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
}

async function printBook(
  html: string,
  book: Book,
  slots: PreparedSlots,
  renderOptions: ParsedBookPdfOptions,
  part: BookOverflowPart,
  layerCss: string,
  resolvedFontCss: string,
  diagramScript: string | undefined,
  resolvedLayoutScripts: readonly LoadedLayoutScript[],
  fontFailures: FontFailure[],
  dependencies: BrowserBookDependencies,
): Promise<PrintResult<true>> {
  if (!book.page) throw new RenderRefusedError('Printing a book needs page; set page before calling bookPdf.')
  const trim = sheetMm(book.page)
  const size = book.print && usesPressLayout(book.print) ? pressBoxes(trim, book.print).bleedBox : trim
  const paginated = book.mode === 'paginated'
  const marginLayer = part === 'margin'
  const fontCss = `${resolvedFontCss}${dependencies.fontFaces(renderOptions)}`
  const baseCss = `${bookPageCss(book, marginLayer || paginated)}${layerCss}`
  const sheets = paginated ? undefined : refusedAsRender(() => frameStyleSheets(book.style, book.brand, `${fontCss}${baseCss}`))
  let composedPlan: SavedPlan | undefined
  const srcdoc = refusedAsRender(() =>
    bookSrcdoc(html, book, fontCss, baseCss, renderOptions.css, marginLayer, diagramScript, resolvedLayoutScripts, {
      sheets,
      origins: renderOptions.origins,
      limits: renderOptions.limits,
      plan: renderOptions.plan,
      breaks: renderOptions.breaks,
      profile: renderOptions.preflight?.profile,
      preflightSeed: renderOptions.preflight?.seed,
      ...renderProgressDocumentOptions(renderOptions.progress),
    }),
  )
  const setup: TabSetup = paginated
    ? {
        ...paginatedBookTabSetup(book, srcdoc, slots, renderOptions),
        ...fontLoadSetup(fontFailures, renderOptions.fontLoad?.report),
        beforeOutput: async (tab) => {
          await awaitBookComposition(tab, renderOptions.preflight)
          composedPlan = renderOptions.plan ?? (await composedPlanFromTab(tab, renderOptions.limits))
          await renderOptions.beforeOutput?.(tab)
        },
      }
    : {
        viewport: { width: Math.round(size.width * PX_PER_MM), height: Math.round(size.height * PX_PER_MM) },
        scripts: continuousBookNeedsScripts(html, sheets ?? [], renderOptions.css, book.scripts, marginLayer),
        html: srcdoc,
        slots,
        readiness: renderReadiness(marginLayer ? 'refuse' : book.scripts, hasDiagram(html), renderOptions.waitForPageReady !== false),
        boundMs: renderOptions.boundMs,
        beforeOutput: renderOptions.beforeOutput,
        ...assetSetup(renderOptions),
        ...fontLoadSetup(fontFailures, renderOptions.fontLoad?.report),
      }
  let output = await dependencies.render(
    setup,
    paginated
      ? {
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        }
      : {
          ...pagePdfSize(size),
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        },
    Math.round((paginated ? paginatedBookWidth(book) : size.width) * PX_PER_MM),
    part,
  )
  if (!composedPlan) return output
  const trims = composedPlan.pages.map((page, index) => {
    const geometry = resolveBookPageGeometry(book, page.pageGeometry)
    if (!geometry)
      throw new RenderRefusedError(
        `The plan page ${index + 1} names unknown page geometry ${JSON.stringify(page.pageGeometry)}; compute a new plan to clear this refusal.`,
      )
    return geometry.paper
  })
  const pageSizeRemedy = (index: number) => {
    const name = composedPlan?.pages[index]?.pageGeometry
    const geometry = name === undefined ? 'the default geometry' : `geometry ${JSON.stringify(name)}`
    return `Plan page ${index + 1} uses ${geometry}; check that geometry's paper or compute a new plan to clear this refusal.`
  }
  if (!book.print || !usesPressLayout(book.print)) output = { ...output, bytes: await setPdfPageSizes(output.bytes, trims, pageSizeRemedy) }
  else {
    const boxes = trims.map((trim) => pressBoxes(trim, book.print as NonNullable<Book['print']>))
    const sized = await setPdfPageSizes(
      output.bytes,
      boxes.map((item) => item.bleedBox),
      pageSizeRemedy,
    )
    output = { ...output, bytes: await addPressBoxesByPage(sized, boxes, book.print.markColor) }
  }
  const document = await loadPdf(output.bytes)
  writePlanFolios(document, composedPlan.folios)
  return { ...output, bytes: await document.save() }
}

export async function renderBrowserBookPdf(
  book: Book,
  options: ParsedBookPdfOptions,
  fontCss: string,
  dependencies: BrowserBookDependencies,
  day: AsOfDay,
): Promise<Uint8Array> {
  refuseProgressUnlessOneComposition(options, book.mode === 'paginated' ? 1 : 0)
  if (book.mode !== 'paginated' && (options.plan !== undefined || options.breaks !== undefined)) {
    return Promise.reject(new RenderRefusedError('bookPdf with plan or breaks needs a paginated book; set mode to paginated to clear this refusal'))
  }
  let script: Promise<string | undefined> | undefined
  let resolvedLayouts: Promise<LoadedLayoutScript[]> | undefined
  return renderBookPdf(
    book,
    options,
    {
      print: async (html, book, slots, renderOptions, part, layerCss = '') => {
        script ??= resolveDiagramScript(bookDocument(book).html)
        resolvedLayouts ??= layoutScripts(bookDocument(book).html)
        return printBook(html, book, slots, renderOptions, part, layerCss, fontCss, await script, await resolvedLayouts, dependencies.fontFailures ?? [], dependencies)
      },
      finish: dependencies.finish,
    },
    day,
  )
}

export async function renderBrowserBookPlan(
  input: Book,
  options: BookPlanOptions & { fontFailures?: FontFailure[] },
  fontCss: string,
  withTab: (setup: TabSetup, body: (tab: Tab) => Promise<SavedPlan>) => Promise<SavedPlan>,
  day: AsOfDay,
): Promise<SavedPlan> {
  if (input.mode !== 'paginated') {
    throw new RenderRefusedError('bookPlan needs a paginated book; set mode to paginated to clear this refusal')
  }
  // The plan must measure the same filled text that bookPdf prints, or its replay refuses.
  const { value: book, slots } = await fillBookForDay(input, day, options.slots)
  if (!book.page) throw new RenderRefusedError('Printing a book needs page; set page before calling bookPlan.')
  const diagramScript = await resolveDiagramScript(bookDocument(book).html)
  const resolvedLayoutScripts = await layoutScripts(bookDocument(book).html)
  const srcdoc = refusedAsRender(() =>
    bookSrcdoc('', book, fontCss, bookPageCss(book, true), options.css, false, diagramScript, resolvedLayoutScripts, {
      origins: options.origins,
      limits: options.limits,
      breaks: options.breaks,
      ...renderProgressDocumentOptions(options.progress),
    }),
  )
  return withTab(
    {
      ...paginatedBookTabSetup(book, srcdoc, slotsForDocument(slots, [bookSlotFrames(book).all]), options),
      ...fontLoadSetup(options.fontFailures ?? [], options.fontLoad?.report),
    },
    async (tab) => {
      await awaitBookComposition(tab)
      return composedPlanFromTab(tab, options.limits)
    },
  )
}
