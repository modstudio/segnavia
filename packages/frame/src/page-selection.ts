import type { PageSelection } from './bridge.ts'
import { requestSelection } from './selection-request.ts'

export const PAGE_CHANGED_SELECTION = 'Cannot read the selection because the page changed before it replied. Read the selection from the current page.'
export const PAGE_CHANGED_HEADING = 'Cannot scroll to the heading because the page changed before it replied. Scroll to a heading in the current page.'

export type PageRequestCancellation = (reason: Error) => void
export type PendingPageRequest = { cancel?: PageRequestCancellation; changed: string }

export interface PageRequestState {
  pending: Set<PendingPageRequest>
  posted: Set<PendingPageRequest>
  ready: Set<() => void>
}

export function createPageRequestState(): PageRequestState {
  return { pending: new Set(), posted: new Set(), ready: new Set() }
}

export function whenPageReady(state: PageRequestState, frameReady: boolean, request: PendingPageRequest): (post: () => void) => () => void {
  return (post) => {
    const postCurrent = () => {
      state.posted.add(request)
      post()
    }
    if (frameReady) {
      postCurrent()
      return () => {}
    }
    state.ready.add(postCurrent)
    return () => state.ready.delete(postCurrent)
  }
}

export function trackPageRequest<T extends { promise: Promise<unknown>; cancel: PageRequestCancellation }>(
  state: PageRequestState,
  pending: PendingPageRequest,
  request: T,
): T {
  pending.cancel = request.cancel
  state.pending.add(pending)
  void request.promise.then(
    () => finishPageRequest(state, pending),
    () => finishPageRequest(state, pending),
  )
  return request
}

export function cancelPageRequests(state: PageRequestState, postedOnly = false): void {
  const requests = postedOnly ? state.posted : state.pending
  for (const request of [...requests]) request.cancel?.(new Error(request.changed))
}

export function releaseReadyPageRequests(state: PageRequestState): void {
  for (const post of [...state.ready]) post()
  state.ready.clear()
}

function finishPageRequest(state: PageRequestState, request: PendingPageRequest): void {
  state.pending.delete(request)
  state.posted.delete(request)
}

export function readPageSelection(
  page: { scripts?: string } | null,
  frame: HTMLIFrameElement | null,
  hostServed: boolean,
  frameReady: boolean,
  state: PageRequestState,
): Promise<PageSelection> {
  if (!page || !frame?.contentWindow)
    return Promise.reject(new Error('Cannot read the selection because no page is shown or no frame is mounted. Show a page before reading its selection.'))
  if (hostServed)
    return Promise.reject(
      new Error('Cannot read the selection from a host-served document. Load a page whose author scripts are refused instead of using showUrl.'),
    )
  if (page.scripts !== 'refuse')
    return Promise.reject(
      new Error(
        'Cannot read the selection while author scripts run. A selection is read only from a page whose author scripts are refused, because an author script could forge the reply.',
      ),
    )
  const pending: PendingPageRequest = { changed: PAGE_CHANGED_SELECTION }
  return trackPageRequest(state, pending, requestSelection(frame, whenPageReady(state, frameReady, pending), 'page')).promise
}
