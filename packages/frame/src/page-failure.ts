import { dispatchElementError } from './element-error.ts'

export function dispatchPageFailure(target: EventTarget, error: unknown, current: boolean): void {
  if (current) dispatchElementError(target, error)
}
