import type { Scripts } from '@segnavia/format'
import { HEADING_ID_LIMIT, headingMessage, MESSAGE } from './bridge.ts'
import { FRAME_REPLY_MS, requestFromFrame } from './frame-request.ts'
import { pageRequestRefusal } from './page-request.ts'

export interface HeadingRequest {
  promise: Promise<boolean>
  cancel: (reason: Error) => void
}

export function clampHeadingTop(top: number, sheetHeight: number): number {
  return Math.min(Math.max(0, sheetHeight), Math.max(0, top))
}

function scrollMarker(sheet: HTMLElement, top: number, behavior?: ScrollBehavior): void {
  const marker = document.createElement('span')
  marker.className = 'segnavia-page__heading-marker'
  marker.setAttribute('aria-hidden', 'true')
  Object.assign(marker.style, {
    display: 'block',
    position: 'relative',
    insetBlockStart: `${top}px`,
    inlineSize: '0',
    blockSize: '0',
    pointerEvents: 'none',
    scrollMarginBlockStart: 'var(--segnavia-heading-scroll-margin,0px)',
  })
  sheet.prepend(marker)
  try {
    marker.scrollIntoView({ block: 'start', ...(behavior === undefined ? {} : { behavior }) })
  } finally {
    marker.remove()
  }
}

export function requestHeading(
  frame: HTMLIFrameElement,
  heading: string,
  sheet: HTMLElement,
  whenReady: (post: () => void) => () => void,
  behavior?: ScrollBehavior,
  timeoutMs = FRAME_REPLY_MS,
): HeadingRequest {
  const request = requestFromFrame<number | null>(
    frame,
    whenReady,
    { type: MESSAGE.headingRequest, heading },
    (event, id) => headingMessage(event, frame, id),
    (ms) => new Error(`Cannot scroll to the heading because the page did not send a valid reply within ${ms} ms. Try again.`),
    timeoutMs,
  )
  return {
    ...request,
    promise: request.promise.then((top) => {
      if (top === null) return false
      scrollMarker(sheet, clampHeadingTop(top, sheet.offsetHeight), behavior)
      return true
    }),
  }
}

export function headingRefusal(heading: unknown, shown: boolean, hostServed: boolean, scripts: Scripts | undefined): Error | null {
  if (typeof heading !== 'string' || heading.length < 1 || heading.length > HEADING_ID_LIMIT)
    return new Error(
      `Cannot scroll to the heading because its id is not a string from 1 to ${HEADING_ID_LIMIT} characters. Pass an id returned by markdownOutline(page.body).`,
    )
  return pageRequestRefusal('scroll to', 'heading', shown, hostServed, scripts)
}
