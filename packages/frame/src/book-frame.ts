import { type BookView, resolveDirection } from '@segnavia/format'
import { bookStylesheet } from '@segnavia/html'
import type { BookLayout } from './book-presentation.ts'
import { flowViewDocument, paginatedViewDocument } from './book-view-document.ts'
import { frameDocument, newNonce } from './bridge.ts'
import { bookLabel } from './labels.ts'

export function bookFrame(
  view: BookView,
  css?: string,
  spread = false,
  layout: BookLayout = 'pages',
  dependencyOrigins: Iterable<string> = [],
): { title: string; srcdoc: string } {
  const title = view.title ?? bookLabel(view.lang)
  if (view.pagination) {
    return {
      title,
      srcdoc:
        layout === 'flow' && view.flow
          ? flowViewDocument(view, { nonce: newNonce(), fontCss: css })
          : paginatedViewDocument(view, view.pagination, { nonce: newNonce(), fontCss: css, screen: { spread } }),
    }
  }
  return {
    title,
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
