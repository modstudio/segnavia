import type { Page } from '@segnavia/format'
import { headingRefusal, requestHeading } from './heading-request.ts'
import { PAGE_CHANGED_HEADING, type PageRequestState, type PendingPageRequest, trackPageRequest, whenPageReady } from './page-request.ts'

export function scrollPageToHeading(
  heading: string,
  options: { behavior?: ScrollBehavior } | undefined,
  page: Pick<Page, 'scripts'> | null,
  frame: HTMLIFrameElement | null,
  sheet: HTMLElement | null,
  hostServed: boolean,
  frameReady: boolean,
  state: PageRequestState,
): Promise<boolean> {
  const refusal = headingRefusal(heading, Boolean(page && frame?.contentWindow && sheet), hostServed, page?.scripts)
  if (refusal) return Promise.reject(refusal)
  const pending: PendingPageRequest = { changed: PAGE_CHANGED_HEADING }
  return trackPageRequest(
    state,
    pending,
    requestHeading(frame as HTMLIFrameElement, heading, sheet as HTMLElement, whenPageReady(state, frameReady, pending), options?.behavior),
  ).promise
}
