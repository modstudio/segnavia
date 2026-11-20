import type { RefusalCause } from '@segnavia/format'

// HTTP keeps the renderer document non-secure while giving it a real origin.
export const RENDER_DOCUMENT_URL = 'http://segnavia.invalid/'

// Chromium titles the PDF of an untitled document with its URL's host; the PDF writer removes that placeholder.
export const RENDER_PLACEHOLDER_TITLE = new URL(RENDER_DOCUMENT_URL).host

export type DocumentRouteDecision = { action: 'asset' } | { action: 'fulfill' } | { action: 'abort'; cause: RefusalCause }

export function documentRouteDecision(url: string, navigation: boolean, mainFrame: boolean, fulfilled: boolean): DocumentRouteDecision {
  if (url === RENDER_DOCUMENT_URL && navigation && mainFrame && !fulfilled) return { action: 'fulfill' }
  if (new URL(url).origin !== new URL(RENDER_DOCUMENT_URL).origin) return { action: 'asset' }
  return {
    action: 'abort',
    cause: {
      code: 'unsupported-fetch',
      subject: url,
      message: `${url} uses the renderer document origin, which answers only its first main-frame navigation; use an absolute approved asset URL to clear this refusal`,
      adviceFor: 'author',
    },
  }
}
