export const AFTER_PRINT_FALLBACK_MS = 1000

export function waitForReadiness(readiness: readonly Promise<unknown>[], deadline: Promise<unknown>): Promise<void> {
  return Promise.race([Promise.all(readiness.map((item) => item.catch(() => undefined))), deadline]).then(() => undefined)
}

export function waitForPaint(requestFrame: (callback: FrameRequestCallback) => number): Promise<void> {
  return new Promise((resolve) => requestFrame(() => requestFrame(() => resolve())))
}

export function waitForAfterPrint(win: Window, fallbackMs = AFTER_PRINT_FALLBACK_MS): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0
    const finish = () => {
      win.removeEventListener('afterprint', finish)
      win.clearTimeout(timer)
      resolve()
    }
    win.addEventListener('afterprint', finish, { once: true })
    timer = win.setTimeout(finish, fallbackMs)
  })
}
