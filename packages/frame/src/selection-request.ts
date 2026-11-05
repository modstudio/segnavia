import { MESSAGE, type PageSelection, SELECTION_TEXT_LIMIT, selectionMessage } from './bridge.ts'
import { FRAME_REPLY_MS, requestFromFrame } from './frame-request.ts'

export { FRAME_REPLY_MS as SELECTION_REPLY_MS } from './frame-request.ts'

export interface SelectionRequest {
  promise: Promise<PageSelection>
  cancel: (reason: Error) => void
}

export function requestSelection(
  frame: HTMLIFrameElement,
  whenReady: (post: () => void) => () => void,
  subject: 'page' | 'slide',
  timeoutMs = FRAME_REPLY_MS,
): SelectionRequest {
  return requestFromFrame(
    frame,
    whenReady,
    { type: MESSAGE.selectionRequest },
    (event, id) => {
      const result = selectionMessage(event, frame, id)
      if (result && 'selection' in result) return result.selection
      if (result && 'oversize' in result)
        return new Error(
          `Cannot read the selection because its reply is longer than the ${SELECTION_TEXT_LIMIT}-unit limit. Shorten the ${subject} or selection.`,
        )
      return undefined
    },
    (ms) => new Error(`Cannot read the selection because the ${subject} did not send a valid reply within ${ms} ms. Try again.`),
    timeoutMs,
  )
}
