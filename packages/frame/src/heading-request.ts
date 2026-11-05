import { HEADING_ID_LIMIT, headingMessage, MESSAGE } from './bridge.ts'
import { SELECTION_REPLY_MS } from './selection-request.ts'

export interface HeadingRequest {
  promise: Promise<boolean>
  cancel: (reason: Error) => void
}

let headingId = 0

export function clampHeadingTop(top: number, sheetHeight: number): number {
  return Math.min(Math.max(0, sheetHeight), Math.max(0, top))
}

function scrollMarker(sheet: HTMLElement, top: number, behavior?: ScrollBehavior): void {
  const marker = document.createElement('span')
  marker.className = 'segnavia-page__heading-marker'
  marker.setAttribute('aria-hidden', 'true')
  marker.style.insetBlockStart = `${top}px`
  sheet.append(marker)
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
  sheetHeight: number,
  whenReady: (post: () => void) => () => void,
  behavior?: ScrollBehavior,
  timeoutMs = SELECTION_REPLY_MS,
): HeadingRequest {
  headingId = (headingId % Number.MAX_SAFE_INTEGER) + 1
  const id = headingId
  let cancel = (_reason: Error) => {}
  const promise = new Promise<number | null>((resolve, reject) => {
    const frameWindow = frame.contentWindow as Window
    let stopWaiting = () => {}
    let settled = false
    const finish = (result: number | null | Error) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      stopWaiting()
      result instanceof Error ? reject(result) : resolve(result)
    }
    const onMessage = (event: MessageEvent) => {
      const top = headingMessage(event, frame, id)
      if (top !== undefined) finish(top)
    }
    window.addEventListener('message', onMessage)
    const timer = setTimeout(
      () => finish(new Error(`Cannot scroll to the heading because the page did not send a valid reply within ${timeoutMs} ms. Try again.`)),
      timeoutMs,
    )
    cancel = finish
    stopWaiting = whenReady(() => frameWindow.postMessage({ type: MESSAGE.headingRequest, id, heading }, '*'))
  }).then((top) => {
    if (top === null) return false
    scrollMarker(sheet, clampHeadingTop(top, sheetHeight), behavior)
    return true
  })
  return { promise, cancel }
}

export function headingRefusal(
  heading: unknown,
  shown: boolean,
  hostServed: boolean,
  scripts: string | undefined,
): Error | null {
  if (typeof heading !== 'string' || heading.length < 1 || heading.length > HEADING_ID_LIMIT)
    return new Error(
      `Cannot scroll to the heading because its id is not a string from 1 to ${HEADING_ID_LIMIT} characters. Pass an id returned by markdownOutline(page.body).`,
    )
  if (!shown) return new Error('Cannot scroll to the heading because no page is shown or no frame is mounted. Show a page before scrolling to its heading.')
  if (hostServed)
    return new Error('Cannot scroll to a heading in a host-served document. Load a page whose author scripts are refused instead of using showUrl.')
  if (scripts !== 'refuse')
    return new Error(
      'Cannot scroll to the heading while author scripts run. A heading is located only in a page whose author scripts are refused, because an author script could forge the reply.',
    )
  return null
}
