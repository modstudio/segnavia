import { type Book, type Limits, PX_PER_MM, resolveDirection, sheetMm } from '@segnavia/format'
import {
  BOOK_COMPOSED_ATTRIBUTE,
  BOOK_FAILURE_ATTRIBUTE,
  PaginatedBookRefusedError,
  bookDocument as paginatedBookDocument,
} from '@segnavia/frame/book-document'
import { frameDocument, newNonce } from '@segnavia/frame/bridge'
import { hasDiagram, withDiagramScript } from '@segnavia/frame/diagrams'
import { bookDocument, bookStylesheet, type PreparedSlots } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import { bookPageCss, renderBookPdf } from './book-pdf.ts'
import { resolveDiagramScript } from './diagram-script.ts'
import { RenderRefusedError } from './errors.ts'
import { type DependencyCache, dependencySetup, type RenderOptions } from './options.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'
import { pagePdfSize } from './pdf-page-size.ts'
import { RENDER_READY_BINDING, type RenderReadiness, renderReadiness } from './render-readiness.ts'
import { preparedSlotsFor } from './slot-fill.ts'

async function awaitBookComposition(tab: Tab): Promise<void> {
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

/** Whether author markup or any author stylesheet declares a keep, which only the bridge's keep pass applies. */
export function usesKeepWith(...sources: Array<string | undefined>): boolean {
  return sources.some((source) => source?.includes('--segnavia-keep-with') === true)
}

function bookSrcdoc(
  html: string,
  book: Book,
  fontCss: string,
  css: string,
  marginLayer: boolean,
  diagramScript: string | undefined,
  dependencyOrigins?: Iterable<string>,
  limits?: Limits,
): string {
  const nonce = newNonce()
  if (book.mode === 'paginated') return paginatedBookDocument(book, { nonce, fontCss, css, printBackground: true, diagramScript, limits })
  return frameDocument(withDiagramScript(html, nonce, diagramScript), {
    scripts: marginLayer ? 'refuse' : book.scripts,
    nonce,
    dir: marginLayer ? 'ltr' : resolveDirection(book.dir, book.lang, book.title),
    lang: book.lang,
    css: bookStylesheet(fontCss, book.css, css),
    relayKeys: false,
    reportHeight: false,
    dependencyOrigins,
    readyCallback: hasDiagram(html) ? RENDER_READY_BINDING : undefined,
  })
}

async function printBook(
  html: string,
  book: Book,
  renderOptions: RenderOptions,
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
  const css = `${bookPageCss(book, marginLayer || paginated)}${layerCss}${renderOptions.css ?? ''}`
  let srcdoc: string
  try {
    srcdoc = bookSrcdoc(html, book, fontCss, css, marginLayer, diagramScript, renderOptions.dependencyOrigins, renderOptions.limits)
  } catch (error) {
    if (error instanceof PaginatedBookRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
  return dependencies.render(
    {
      viewport: { width: Math.round(size.width * PX_PER_MM), height: Math.round(size.height * PX_PER_MM) },
      scripts: paginated || (!marginLayer && book.scripts === 'sandboxed') || hasDiagram(html) || usesKeepWith(html, book.css, css),
      html: srcdoc,
      slots: preparedSlotsFor(book),
      readiness: paginated
        ? renderReadiness('refuse', false, false)
        : renderReadiness(marginLayer ? 'refuse' : book.scripts, hasDiagram(html), renderOptions.waitForPageReady !== false),
      boundMs: renderOptions.boundMs,
      beforeOutput: paginated
        ? async (tab) => {
            await awaitBookComposition(tab)
            await renderOptions.beforeOutput?.(tab)
          }
        : renderOptions.beforeOutput,
      ...dependencySetup(renderOptions),
    },
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

export function renderBrowserBookPdf(input: Book, options: RenderOptions, fontCss: string, dependencies: BrowserBookDependencies): Promise<Uint8Array> {
  let script: Promise<string | undefined> | undefined
  return renderBookPdf(input, options, {
    print: async (html, book, renderOptions, part, layerCss = '') => {
      script ??= resolveDiagramScript(bookDocument(book).html)
      return printBook(html, book, renderOptions, part, layerCss, fontCss, await script, dependencies)
    },
    finish: dependencies.finish,
  })
}
