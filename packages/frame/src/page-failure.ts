export function dispatchPageFailure(target: EventTarget, error: unknown, current: boolean): void {
  if (current) target.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
}
