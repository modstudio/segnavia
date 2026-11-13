import {
  type BookView,
  type OriginApproval,
  type PreflightEntry,
  type PreflightProfileInput,
  resolveDirection,
  resolvePreflightProfile,
  type Scripts,
} from '@segnavia/format'
import type { BookLayout } from './book-presentation.ts'
import { flowViewDocument, paginatedViewDocument } from './book-view-document.ts'
import { frameDocument, frameStyleSheets, newNonce } from './bridge.ts'
import { bookLabel } from './labels.ts'
import type { LoadedLayoutScript } from './layout.ts'

export function bookFrame(
  view: BookView,
  options: {
    css?: string
    spread?: boolean
    layout?: BookLayout
    origins?: Iterable<OriginApproval>
    layoutScripts?: readonly LoadedLayoutScript[]
    profile?: PreflightProfileInput
    preflightSeed?: PreflightEntry[]
  } = {},
): { title: string; srcdoc: string; scripts: Scripts } {
  const { css, spread = false, layout = 'pages', origins = [], layoutScripts, profile, preflightSeed } = options
  const title = view.title ?? bookLabel(view.lang)
  if (view.pagination) {
    return {
      title,
      scripts: 'refuse',
      srcdoc:
        layout === 'flow' && view.flow
          ? flowViewDocument(view, { nonce: newNonce(), fontCss: css, layoutScripts })
          : paginatedViewDocument(view, view.pagination, {
              nonce: newNonce(),
              fontCss: css,
              screen: { spread },
              layoutScripts,
              profile: resolvePreflightProfile(profile),
              preflightSeed,
            }),
    }
  }
  const nonce = newNonce()
  return {
    title,
    scripts: view.scripts,
    srcdoc: frameDocument(view.html, {
      scripts: view.scripts,
      nonce,
      dir: resolveDirection(view.dir, view.lang, view.title ?? ''),
      lang: view.lang,
      sheets: frameStyleSheets(view.style, view.brand, css),
      relayKeys: false,
      reportHeight: false,
      origins,
      fonts: view.style?.fonts,
      layoutScripts,
    }),
  }
}
