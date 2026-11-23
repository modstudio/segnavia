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
import { buildFlowViewDocument, buildPaginatedViewDocument } from './book-view-document.ts'
import { buildFrameDocument, type BuiltFrameDocument, frameStyleSheets, newNonce } from './bridge.ts'
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
): { title: string; srcdoc: string; policy: string; scripts: Scripts } {
  const { css, spread = false, layout = 'pages', origins = [], layoutScripts, profile, preflightSeed } = options
  const title = view.title ?? bookLabel(view.lang)
  if (view.pagination) {
    const document =
      layout === 'flow' && view.flow
        ? buildFlowViewDocument(view, { nonce: newNonce(), fontCss: css, layoutScripts })
        : buildPaginatedViewDocument(view, view.pagination, {
            nonce: newNonce(),
            fontCss: css,
            screen: { spread },
            layoutScripts,
            profile: resolvePreflightProfile(profile),
            preflightSeed,
          })
    return {
      title,
      scripts: 'refuse',
      srcdoc: document.html,
      policy: document.policy,
    }
  }
  const nonce = newNonce()
  const document = buildFrameDocument(view.html, {
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
  })
  return {
    title,
    scripts: view.scripts,
    srcdoc: document.html,
    policy: document.policy,
  }
}
