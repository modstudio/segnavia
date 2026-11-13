import { type HtmlPage, isPrintedHtmlPage, type PrintedHtmlPage, printedPageAuthorHtml, resolvePrintedPageHtml } from '@segnavia/html'
import { type FrameOptions, frameDocument, newNonce } from './bridge.ts'
import { type LoadedLayoutScript, layoutsUsed, loadLayoutScripts } from './layout.ts'
import { printedPageValueDocument } from './printed-page-document.ts'
import { type ShownPageDocumentOptions, shownPageDocument } from './shown-page-document.ts'
import type { PreparedSlots } from './slot-render.ts'

type LayoutDocumentBuilder = (nonce: string, layoutScripts: readonly LoadedLayoutScript[]) => string

function loadLayoutDocument(
  html: string,
  build: LayoutDocumentBuilder,
  loaded: (document: string, hasLayoutScripts: boolean) => void,
  failed: (error: unknown) => void,
  loadLayouts: (html: string) => Promise<LoadedLayoutScript[]>,
): void {
  const nonce = newNonce()
  const write = (layoutScripts: readonly LoadedLayoutScript[]) => {
    try {
      loaded(build(nonce, layoutScripts), layoutScripts.length > 0)
    } catch (error) {
      failed(error)
    }
  }
  if (layoutsUsed(html).length === 0) {
    write([])
    return
  }
  void loadLayouts(html).then(write, failed)
}

export function loadPrintedPageDocument(
  source: PrintedHtmlPage | HtmlPage,
  options: Omit<Parameters<typeof printedPageValueDocument>[1], 'nonce' | 'layoutScripts'>,
  loaded: (document: string, hasLayoutScripts: boolean) => void,
  failed: (error: unknown) => void,
  loadLayouts = loadLayoutScripts,
): void {
  const page = isPrintedHtmlPage(source) ? source : resolvePrintedPageHtml(source)
  loadLayoutDocument(
    printedPageAuthorHtml(page),
    (nonce, layoutScripts) => printedPageValueDocument(page, { ...options, nonce, layoutScripts }),
    loaded,
    failed,
    loadLayouts,
  )
}

export function loadPageDocument(
  page: HtmlPage,
  options: Omit<FrameOptions, 'nonce'>,
  loaded: (document: string, hasLayoutScripts: boolean) => void,
  failed: (error: unknown) => void,
  loadLayouts = loadLayoutScripts,
): void {
  loadLayoutDocument(page.html, (nonce, layoutScripts) => frameDocument(page.html, { ...options, nonce, layoutScripts }), loaded, failed, loadLayouts)
}

export function loadShownPageDocument(
  page: HtmlPage,
  resolved: PreparedSlots | undefined,
  options: ShownPageDocumentOptions,
  loaded: (document: string, hasLayoutScripts: boolean) => void,
  failed: (error: unknown) => void,
  loadLayouts = loadLayoutScripts,
): void {
  loadLayoutDocument(page.html, (nonce, layoutScripts) => shownPageDocument(page, resolved, { ...options, nonce, layoutScripts }), loaded, failed, loadLayouts)
}
