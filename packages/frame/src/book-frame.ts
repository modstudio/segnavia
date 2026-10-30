import { type BookView, resolveDirection, type Scripts } from '@segnavia/format'
import { bookStylesheet } from '@segnavia/html'
import type { BookLayout } from './book-presentation.ts'
import { flowViewDocument, paginatedViewDocument } from './book-view-document.ts'
import { frameDocument, newNonce } from './bridge.ts'
import { bookLabel } from './labels.ts'

export function bookFrame(
  view: BookView,
  options: { css?: string; spread?: boolean; layout?: BookLayout; dependencyOrigins?: Iterable<string> } = {},
): { title: string; srcdoc: string; scripts: Scripts } {
  const { css, spread = false, layout = 'pages', dependencyOrigins = [] } = options
  const title = view.title ?? bookLabel(view.lang)
  if (view.pagination) {
    return {
      title,
      scripts: 'refuse',
      srcdoc:
        layout === 'flow' && view.flow
          ? flowViewDocument(view, { nonce: newNonce(), fontCss: css })
          : paginatedViewDocument(view, view.pagination, { nonce: newNonce(), fontCss: css, screen: { spread } }),
    }
  }
  return {
    title,
    scripts: view.scripts,
    srcdoc: frameDocument(view.html, {
      scripts: view.scripts,
      nonce: newNonce(),
      dir: resolveDirection(view.dir, view.lang, view.title ?? ''),
      lang: view.lang,
      css: bookStylesheet(css, view.css, undefined),
      relayKeys: false,
      reportHeight: false,
      dependencyOrigins,
    }),
  }
}
