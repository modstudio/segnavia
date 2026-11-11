export function dispatchElementError(target: EventTarget, reason: unknown): void {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  target.dispatchEvent(new ErrorEvent('error', { message: error.message, error }))
}
