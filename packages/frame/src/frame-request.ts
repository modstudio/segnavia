export const FRAME_REPLY_MS = 2000

export interface FrameRequest<T> {
  promise: Promise<T>
  cancel: (reason: Error) => void
}

let requestId = 0

export function requestFromFrame<T>(
  frame: HTMLIFrameElement,
  whenReady: (post: () => void) => () => void,
  request: Record<string, unknown>,
  read: (event: MessageEvent, id: number) => T | Error | undefined,
  timeoutError: (ms: number) => Error,
  timeoutMs = FRAME_REPLY_MS,
): FrameRequest<T> {
  requestId = (requestId % Number.MAX_SAFE_INTEGER) + 1
  const id = requestId
  let cancel = (_reason: Error) => {}
  const promise = new Promise<T>((resolve, reject) => {
    const frameWindow = frame.contentWindow as Window
    let stopWaiting = () => {}
    let settled = false
    const finish = (result: T | Error) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      stopWaiting()
      result instanceof Error ? reject(result) : resolve(result)
    }
    const onMessage = (event: MessageEvent) => {
      const result = read(event, id)
      if (result !== undefined) finish(result)
    }
    window.addEventListener('message', onMessage)
    const timer = setTimeout(() => finish(timeoutError(timeoutMs)), timeoutMs)
    cancel = finish
    stopWaiting = whenReady(() => frameWindow.postMessage({ ...request, id }, '*'))
  })
  return { promise, cancel }
}
