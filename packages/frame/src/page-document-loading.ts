import type { FontFailure } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
import { type FrameOptions, frameDocument, newNonce } from './bridge.ts'
import { hasDiagram, loadDiagramScript, withDiagramScript } from './diagram-document.ts'
import { printedPageValueDocument } from './printed-page-document.ts'
import { shownPageDocument } from './shown-page-document.ts'
import type { PreparedSlots } from './slot-render.ts'

type DiagramScriptLoader = (html: string) => Promise<string | undefined>
type DiagramDocumentBuilder = (nonce: string, diagramScript: string | undefined) => string

function loadDiagramDocument(
  html: string,
  build: DiagramDocumentBuilder,
  loaded: (document: string) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader,
): void {
  const nonce = newNonce()
  const write = (diagramScript: string | undefined) => {
    try {
      loaded(build(nonce, diagramScript))
    } catch (error) {
      failed(error)
    }
  }
  if (!hasDiagram(html)) {
    write(undefined)
    return
  }
  void load(html).then(write, (error) => {
    failed(error)
    write(undefined)
  })
}

export function loadPrintedPageDocument(
  page: HtmlPage,
  options: Omit<Parameters<typeof printedPageValueDocument>[1], 'nonce' | 'diagramScript'>,
  loaded: (document: string) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader = loadDiagramScript,
): void {
  loadDiagramDocument(page.html, (nonce, diagramScript) => printedPageValueDocument(page, { ...options, nonce, diagramScript }), loaded, failed, load)
}

export function loadPageDocument(
  page: HtmlPage,
  options: Omit<FrameOptions, 'nonce'>,
  loaded: (document: string) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader = loadDiagramScript,
): void {
  loadDiagramDocument(page.html, (nonce, script) => frameDocument(withDiagramScript(page.html, nonce, script), { ...options, nonce }), loaded, failed, load)
}

export function loadShownPageDocument(
  page: HtmlPage,
  resolved: PreparedSlots | undefined,
  options: { baseCss?: string; css?: string; csp?: string; dependencyOrigins?: Iterable<string>; fontFailures?: FontFailure[] },
  loaded: (document: string) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader = loadDiagramScript,
): void {
  loadDiagramDocument(
    page.html,
    (nonce, script) => shownPageDocument({ ...page, html: withDiagramScript(page.html, nonce, script) }, resolved, { ...options, nonce }),
    loaded,
    failed,
    load,
  )
}
