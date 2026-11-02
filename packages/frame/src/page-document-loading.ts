import type { HtmlPage } from '@segnavia/html'
import { type FrameOptions, frameDocument, newNonce } from './bridge.ts'
import { hasDiagram, loadDiagramScript, withDiagramScript } from './diagram-document.ts'
import { shownPageDocument } from './motif-expansion.ts'
import type { PreparedSlots } from './slot-render.ts'

type DiagramScriptLoader = (html: string) => Promise<string | undefined>

export function loadPageDocument(
  page: HtmlPage,
  options: Omit<FrameOptions, 'nonce'>,
  loaded: (document: string) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader = loadDiagramScript,
): void {
  const nonce = newNonce()
  if (!hasDiagram(page.html)) {
    loaded(frameDocument(page.html, { ...options, nonce }))
    return
  }
  const write = (script: string | undefined) => {
    try {
      loaded(frameDocument(withDiagramScript(page.html, nonce, script), { ...options, nonce }))
    } catch (error) {
      failed(error)
    }
  }
  void load(page.html).then(write, (error) => {
    failed(error)
    write(undefined)
  })
}

export function loadShownPageDocument(
  page: HtmlPage,
  resolved: PreparedSlots | undefined,
  options: { css?: string; csp?: string; dependencyOrigins?: Iterable<string> },
  loaded: (document: string) => void,
  failed: (error: unknown) => void,
  load: DiagramScriptLoader = loadDiagramScript,
): void {
  const nonce = newNonce()
  if (!hasDiagram(page.html)) {
    loaded(shownPageDocument(page, resolved, { ...options, nonce }))
    return
  }
  const write = (script: string | undefined) => {
    try {
      loaded(shownPageDocument({ ...page, html: withDiagramScript(page.html, nonce, script) }, resolved, { ...options, nonce }))
    } catch (error) {
      failed(error)
    }
  }
  void load(page.html).then(write, (error) => {
    failed(error)
    write(undefined)
  })
}
