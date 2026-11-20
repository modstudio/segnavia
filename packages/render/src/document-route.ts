import type { RefusalCause } from '@segnavia/format'
import { RENDER_DOCUMENT_URL } from './render-document-origin.ts'

export type DocumentRouteDecision = { action: 'asset' } | { action: 'fulfill' } | { action: 'abort'; cause: RefusalCause }

export function documentRouteDecision(url: string, navigation: boolean, mainFrame: boolean, fulfilled: boolean): DocumentRouteDecision {
  if (url === RENDER_DOCUMENT_URL && navigation && mainFrame && !fulfilled) return { action: 'fulfill' }
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    return { action: 'asset' }
  }
  if (origin !== new URL(RENDER_DOCUMENT_URL).origin) return { action: 'asset' }
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
