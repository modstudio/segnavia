import { MESSAGE, type PageSelection, SELECTION_TEXT_LIMIT, selectionMessage } from './bridge.ts'

export const SELECTION_REPLY_MS = 2000

export interface SelectionRequest {
  promise: Promise<PageSelection>
  cancel: (reason: Error) => void
}

let selectionId = 0

export function requestSelection(
  frame: HTMLIFrameElement,
  whenReady: (post: () => void) => () => void,
  subject: 'page' | 'slide',
  timeoutMs = SELECTION_REPLY_MS,
): SelectionRequest {
  selectionId = (selectionId % Number.MAX_SAFE_INTEGER) + 1
  const id = selectionId
  let cancel = (_reason: Error) => {}
  const promise = new Promise<PageSelection>((resolve, reject) => {
    const frameWindow = frame.contentWindow as Window
    let stopWaiting = () => {}
    let settled = false
    const post = () => frameWindow.postMessage({ type: MESSAGE.selectionRequest, id }, '*')
    const finish = (result: PageSelection | Error) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      stopWaiting()
      result instanceof Error ? reject(result) : resolve(result)
    }
    const onMessage = (event: MessageEvent) => {
      const result = selectionMessage(event, frame, id)
      if (result && 'selection' in result) finish(result.selection)
      else if (result && 'oversize' in result)
        finish(
          new Error(`Cannot read the selection because its reply is longer than the ${SELECTION_TEXT_LIMIT}-unit limit. Shorten the ${subject} or selection.`),
        )
    }
    window.addEventListener('message', onMessage)
    const timer = setTimeout(
      () => finish(new Error(`Cannot read the selection because the ${subject} did not send a valid reply within ${timeoutMs} ms. Try again.`)),
      timeoutMs,
    )
    cancel = finish
    stopWaiting = whenReady(post)
  })
  return { promise, cancel }
}
