import type { Scripts } from '@segnavia/format'

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

export function pageRequestRefusal(
  action: 'read' | 'scroll to',
  subject: 'selection' | 'heading',
  shown: boolean,
  hostServed: boolean,
  scripts: Scripts | undefined,
): Error | null {
  const selection = subject === 'selection'
  if (!shown)
    return new Error(
      `Cannot ${action} the ${subject} because no page is shown or no frame is mounted. Show a page before ${selection ? 'reading its selection' : 'scrolling to its heading'}.`,
    )
  if (hostServed)
    return new Error(
      `Cannot ${action} ${selection ? 'the selection from' : 'a heading in'} a host-served document. Load a page whose author scripts are refused instead of using showUrl.`,
    )
  if (scripts !== 'refuse')
    return new Error(
      selection
        ? 'Cannot read the selection while author scripts run. A selection is read only from a page whose author scripts are refused, because an author script could forge the reply.'
        : 'Cannot scroll to the heading while author scripts run. A heading is located only in a page whose author scripts are refused, because an author script could forge the reply.',
    )
  return null
}
