import { type BookView, resolveDirection, type Scripts } from '@segnavia/format'
import type { BookLayout } from './book-presentation.ts'
import { flowViewDocument, paginatedViewDocument } from './book-view-document.ts'
import { frameDocument, frameStyleSheets, newNonce } from './bridge.ts'
import { withDiagramScript } from './diagram-document.ts'
import { bookLabel } from './labels.ts'

export function bookFrame(
  view: BookView,
  options: { css?: string; spread?: boolean; layout?: BookLayout; dependencyOrigins?: Iterable<string>; diagramScript?: string } = {},
): { title: string; srcdoc: string; scripts: Scripts } {
  const { css, spread = false, layout = 'pages', dependencyOrigins = [], diagramScript } = options
  const title = view.title ?? bookLabel(view.lang)
  if (view.pagination) {
    return {
      title,
      scripts: 'refuse',
      srcdoc:
        layout === 'flow' && view.flow
          ? flowViewDocument(view, { nonce: newNonce(), fontCss: css, diagramScript })
          : paginatedViewDocument(view, view.pagination, { nonce: newNonce(), fontCss: css, screen: { spread }, diagramScript }),
    }
  }
  const nonce = newNonce()
  return {
    title,
    scripts: view.scripts,
    srcdoc: frameDocument(withDiagramScript(view.html, nonce, diagramScript), {
      scripts: view.scripts,
      nonce,
      dir: resolveDirection(view.dir, view.lang, view.title ?? ''),
      lang: view.lang,
      sheets: frameStyleSheets(view.style, view.brand, css),
      relayKeys: false,
      reportHeight: false,
      dependencyOrigins,
      fonts: view.style?.fonts,
    }),
  }
}
