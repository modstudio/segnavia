import { type Book, KEEP_WITH_CUSTOM_PROPERTY, type Limits, Plan, PX_PER_MM, resolveDirection, type Plan as SavedPlan, sheetMm } from '@segnavia/format'
import {
  BOOK_COMPOSED_ATTRIBUTE,
  BOOK_FAILURE_ATTRIBUTE,
  PaginatedBookRefusedError,
  bookValueDocument as paginatedBookDocument,
} from '@segnavia/frame/book-document'
import { frameDocument, frameStyleSheets, newNonce, StyleSheetRefusedError } from '@segnavia/frame/bridge'
import { hasDiagram, withDiagramScript } from '@segnavia/frame/diagrams'
import { bookDocument, type PreparedSlots } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import { bookPageCss, renderBookPdf } from './book-pdf.ts'
import { resolveDiagramScript } from './diagram-script.ts'
import { RenderRefusedError } from './errors.ts'
import { type DependencyCache, dependencySetup, type RenderOptions } from './options.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'
import { pagePdfSize } from './pdf-page-size.ts'
import { RENDER_READY_BINDING, type RenderReadiness, renderReadiness } from './render-readiness.ts'
import type { BookPdfOptions, BookPlanOptions } from './renderer.ts'
import { slotsForDocument } from './slot-document.ts'
import { bookSlotFrames, filledBook } from './slot-fill.ts'

export async function awaitBookComposition(tab: Tab): Promise<void> {
  await tab.waitForFunction(({ composed, failed }) => document.documentElement.hasAttribute(composed) || document.documentElement.hasAttribute(failed), {
    composed: BOOK_COMPOSED_ATTRIBUTE,
    failed: BOOK_FAILURE_ATTRIBUTE,
  })
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
  dependencyOrigins?: Iterable<string>
  dependencies?: DependencyCache
}

export interface BrowserBookDependencies {
  render(setup: TabSetup, pdf: Parameters<Tab['pdf']>[0], pageWidth: number, part: BookOverflowPart): Promise<PrintResult<true>>
  fontFaces(options: RenderOptions): string
  finish(pdf: Uint8Array, options: RenderOptions): Promise<Uint8Array>
}

// A chapter can author its own plan carrier, so the composer's published one is the last.
// The tab evaluates this function's source, so the zero-argument overload is the one it calls.
export function lastBookPlanText(): string | null | undefined
export function lastBookPlanText(root: ParentNode): string | null | undefined
export function lastBookPlanText(root: ParentNode = document): string | null | undefined {
  return Array.from(root.querySelectorAll('script[data-segnavia-plan]')).at(-1)?.textContent
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
  options: {
    sheets?: readonly string[]
    dependencyOrigins?: Iterable<string>
    limits?: Limits
    plan?: SavedPlan
    breaks?: string[]
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
      limits: options.limits,
      plan: options.plan,
      breaks: options.breaks ?? options.plan?.breaks,
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
    dependencyOrigins: options.dependencyOrigins,
    readyCallback: hasDiagram(html) ? RENDER_READY_BINDING : undefined,
  })
}

function paginatedBookTabSetup(book: Book, html: string, slots: PreparedSlots, options: RenderOptions): TabSetup {
  if (!book.page) throw new RenderRefusedError('Printing a book needs page; set page before calling bookPdf.')
  const size = sheetMm(book.page)
  return {
    viewport: { width: Math.round(size.width * PX_PER_MM), height: Math.round(size.height * PX_PER_MM) },
    scripts: true,
    html,
    slots,
    readiness: renderReadiness('refuse', false, false),
    boundMs: options.boundMs,
    ...dependencySetup(options),
  }
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
  renderOptions: BookPdfOptions,
  part: BookOverflowPart,
  layerCss: string,
  resolvedFontCss: string,
  diagramScript: string | undefined,
  dependencies: BrowserBookDependencies,
): Promise<PrintResult<true>> {
  if (!book.page) throw new RenderRefusedError('Printing a book needs page; set page before calling bookPdf.')
  const size = sheetMm(book.page)
  const paginated = book.mode === 'paginated'
  const marginLayer = part === 'margin'
  const fontCss = `${resolvedFontCss}${dependencies.fontFaces(renderOptions)}`
  const baseCss = `${bookPageCss(book, marginLayer || paginated)}${layerCss}`
  const sheets = paginated ? undefined : refusedAsRender(() => frameStyleSheets(book.style, `${fontCss}${baseCss}`))
  const srcdoc = refusedAsRender(() =>
    bookSrcdoc(html, book, fontCss, baseCss, renderOptions.css, marginLayer, diagramScript, {
      sheets,
      dependencyOrigins: renderOptions.dependencyOrigins,
      limits: renderOptions.limits,
      plan: renderOptions.plan,
      breaks: renderOptions.breaks,
    }),
  )
  const setup: TabSetup = paginated
    ? {
        ...paginatedBookTabSetup(book, srcdoc, slots, renderOptions),
        beforeOutput: async (tab) => {
          await awaitBookComposition(tab)
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
        ...dependencySetup(renderOptions),
      }
  return dependencies.render(
    setup,
    {
      ...pagePdfSize(size),
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    },
    Math.round(size.width * PX_PER_MM),
    part,
  )
}

export function renderBrowserBookPdf(book: Book, options: BookPdfOptions, fontCss: string, dependencies: BrowserBookDependencies): Promise<Uint8Array> {
  if (book.mode !== 'paginated' && (options.plan !== undefined || options.breaks !== undefined)) {
    return Promise.reject(new RenderRefusedError('bookPdf with plan or breaks needs a paginated book; set mode to paginated to clear this refusal'))
  }
  let script: Promise<string | undefined> | undefined
  return renderBookPdf(book, options, {
    print: async (html, book, slots, renderOptions, part, layerCss = '') => {
      script ??= resolveDiagramScript(bookDocument(book).html)
      return printBook(html, book, slots, renderOptions, part, layerCss, fontCss, await script, dependencies)
    },
    finish: dependencies.finish,
  })
}

export async function renderBrowserBookPlan(
  input: Book,
  options: BookPlanOptions,
  fontCss: string,
  withTab: (setup: TabSetup, body: (tab: Tab) => Promise<SavedPlan>) => Promise<SavedPlan>,
): Promise<SavedPlan> {
  if (input.mode !== 'paginated') {
    throw new RenderRefusedError('bookPlan needs a paginated book; set mode to paginated to clear this refusal')
  }
  // The plan must measure the same filled text that bookPdf prints, or its replay refuses.
  const { value: book, slots } = await filledBook(input, options.slots)
  if (!book.page) throw new RenderRefusedError('Printing a book needs page; set page before calling bookPlan.')
  const diagramScript = await resolveDiagramScript(bookDocument(book).html)
  const srcdoc = refusedAsRender(() =>
    bookSrcdoc('', book, fontCss, bookPageCss(book, true), options.css, false, diagramScript, {
      dependencyOrigins: options.dependencyOrigins,
      limits: options.limits,
      breaks: options.breaks,
    }),
  )
  return withTab(paginatedBookTabSetup(book, srcdoc, slotsForDocument(slots, [bookSlotFrames(book).all]), options), async (tab) => {
    await awaitBookComposition(tab)
    const text = await tab.evaluate(lastBookPlanText)
    try {
      return Plan.parse(JSON.parse(text ?? 'null'), { limits: options.limits })
    } catch (error) {
      throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
    }
  })
}
