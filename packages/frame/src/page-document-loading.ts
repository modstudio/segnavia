import { type HtmlPage, isPrintedHtmlPage, type PrintedHtmlPage, printedPageAuthorHtml, resolvePrintedPageHtml } from '@segnavia/html'
import { type FrameOptions, frameDocument, newNonce } from './bridge.ts'
import { hasDiagram, loadDiagramScript, withDiagramScript } from './diagram-document.ts'
import { type LoadedLayoutScript, layoutsUsed, loadLayoutScripts } from './layout.ts'
import { printedPageValueDocument } from './printed-page-document.ts'
import { type ShownPageDocumentOptions, shownPageDocument } from './shown-page-document.ts'
import type { PreparedSlots } from './slot-render.ts'

type DiagramScriptLoader = (html: string) => Promise<string | undefined>
type DiagramDocumentBuilder = (nonce: string, diagramScript: string | undefined, layoutScripts: readonly LoadedLayoutScript[]) => string

function loadDiagramDocument(
  html: string,
  build: DiagramDocumentBuilder,
  loaded: (document: string, hasLayoutScripts?: boolean) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader,
  loadLayouts: (html: string) => Promise<LoadedLayoutScript[]>,
): void {
  const nonce = newNonce()
  const write = (diagramScript: string | undefined, layoutScripts: readonly LoadedLayoutScript[]) => {
    try {
      loaded(build(nonce, diagramScript, layoutScripts), layoutScripts.length > 0)
    } catch (error) {
      failed(error)
    }
  }
  if (!hasDiagram(html) && layoutsUsed(html).length === 0) {
    write(undefined, [])
    return
  }
  const diagram = hasDiagram(html)
    ? load(html).catch((error) => {
        failed(error)
        return undefined
      })
    : Promise.resolve(undefined)
  void Promise.all([diagram, loadLayouts(html)]).then(
    ([script, layouts]) => write(script, layouts),
    (error) => failed(error),
  )
}

export function loadPrintedPageDocument(
  source: PrintedHtmlPage | HtmlPage,
  options: Omit<Parameters<typeof printedPageValueDocument>[1], 'nonce' | 'diagramScript' | 'layoutScripts'>,
  loaded: (document: string, hasLayoutScripts?: boolean) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader = loadDiagramScript,
  loadLayouts = loadLayoutScripts,
): void {
  const page = isPrintedHtmlPage(source) ? source : resolvePrintedPageHtml(source)
  loadDiagramDocument(
    printedPageAuthorHtml(page),
    (nonce, diagramScript, layoutScripts) => printedPageValueDocument(page, { ...options, nonce, diagramScript, layoutScripts }),
    loaded,
    failed,
    load,
    loadLayouts,
  )
}

export function loadPageDocument(
  page: HtmlPage,
  options: Omit<FrameOptions, 'nonce'>,
  loaded: (document: string, hasLayoutScripts?: boolean) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader = loadDiagramScript,
  loadLayouts = loadLayoutScripts,
): void {
  loadDiagramDocument(
    page.html,
    (nonce, script, layoutScripts) => frameDocument(withDiagramScript(page.html, nonce, script), { ...options, nonce, layoutScripts }),
    loaded,
    failed,
    load,
    loadLayouts,
  )
}

export function loadShownPageDocument(
  page: HtmlPage,
  resolved: PreparedSlots | undefined,
  options: ShownPageDocumentOptions,
  loaded: (document: string, hasLayoutScripts?: boolean) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader = loadDiagramScript,
  loadLayouts = loadLayoutScripts,
): void {
  loadDiagramDocument(
    page.html,
    (nonce, script, layoutScripts) =>
      shownPageDocument({ ...page, html: withDiagramScript(page.html, nonce, script) }, resolved, { ...options, nonce, layoutScripts }),
    loaded,
    failed,
    load,
    loadLayouts,
  )
}
