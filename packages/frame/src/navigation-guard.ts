const navigationGuardKey = Symbol.for('@segnavia/frame/navigation-guard')

export { parseDeckLoad } from './deck-load-origin.ts'

interface NavigationGuardState {
  guard?: (reason: NavigationGuardReason) => Promise<void>
  running?: Promise<void>
}

export type NavigationGuardReason = 'load' | 'navigate'

function state(target: EventTarget): NavigationGuardState {
  const values = target as EventTarget & Record<symbol, NavigationGuardState>
  const existing = values[navigationGuardKey]
  if (existing) return existing
  const created: NavigationGuardState = {}
  values[navigationGuardKey] = created
  return created
}

export function setNavigationGuard(target: EventTarget, guard: (reason: NavigationGuardReason) => Promise<void>): () => void {
  const guarded = state(target)
  guarded.guard = guard
  return () => {
    if (guarded.guard === guard) delete guarded.guard
  }
}

export function runNavigationGuard(target: EventTarget, reason: NavigationGuardReason = 'navigate'): Promise<void> {
  const guarded = state(target)
  const guard = guarded.guard
  if (!guard) return Promise.resolve()
  const active = guarded.running
  if (active) return active
  const next = Promise.resolve().then(() => guard(reason))
  guarded.running = next
  const clear = () => {
    if (guarded.running === next) delete guarded.running
  }
  void next.then(clear, clear)
  return next
}

export function activeNavigationGuard(target: EventTarget): Promise<void> | undefined {
  return state(target).running
}
