import type { Page } from '@segnavia/format'
import type { PageSelection } from './bridge.ts'
import { PAGE_CHANGED_SELECTION, type PageRequestState, type PendingPageRequest, pageRequestRefusal, trackPageRequest, whenPageReady } from './page-request.ts'
import { requestSelection } from './selection-request.ts'

export function readPageSelection(
  page: Pick<Page, 'scripts'> | null,
  frame: HTMLIFrameElement | null,
  hostServed: boolean,
  frameReady: boolean,
  state: PageRequestState,
): Promise<PageSelection> {
  const refusal = pageRequestRefusal('read', 'selection', Boolean(page && frame?.contentWindow), hostServed, page?.scripts)
  if (refusal) return Promise.reject(refusal)
  const pending: PendingPageRequest = { changed: PAGE_CHANGED_SELECTION }
  return trackPageRequest(state, pending, requestSelection(frame as HTMLIFrameElement, whenPageReady(state, frameReady, pending), 'page')).promise
}
