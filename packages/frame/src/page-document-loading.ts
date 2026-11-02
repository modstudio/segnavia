import type { HtmlPage } from '@segnavia/html'
import { type FrameOptions, frameDocument, newNonce } from './bridge.ts'
import { hasDiagram, loadDiagramScript, withDiagramScript } from './diagram-document.ts'
import { shownPageDocument } from './motif-expansion.ts'
import type { PreparedSlots } from './slot-render.ts'

export function loadPageDocument(page: HtmlPage, options: Omit<FrameOptions, 'nonce'>, loaded: (document: string) => void): void {
  const nonce = newNonce()
  if (!hasDiagram(page.html)) {
    loaded(frameDocument(page.html, { ...options, nonce }))
    return
  }
  void loadDiagramScript(page.html).then((script) => loaded(frameDocument(withDiagramScript(page.html, nonce, script), { ...options, nonce })))
}

export function loadShownPageDocument(
  page: HtmlPage,
  resolved: PreparedSlots | undefined,
  options: { css?: string; csp?: string; dependencyOrigins?: Iterable<string> },
  loaded: (document: string) => void,
): void {
  const nonce = newNonce()
  if (!hasDiagram(page.html)) {
    loaded(shownPageDocument(page, resolved, { ...options, nonce }))
    return
  }
  void loadDiagramScript(page.html).then((script) =>
    loaded(shownPageDocument({ ...page, html: withDiagramScript(page.html, nonce, script) }, resolved, { ...options, nonce })),
  )
}
