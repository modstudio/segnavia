const navigationGuardKey = Symbol.for('@segnavia/frame/navigation-guard')

interface NavigationGuardState {
  guard?: () => Promise<void>
  running?: Promise<void>
}

function state(target: EventTarget): NavigationGuardState {
  const values = target as EventTarget & Record<symbol, NavigationGuardState>
  return (values[navigationGuardKey] ??= {})
}

export function setNavigationGuard(target: EventTarget, guard: (() => Promise<void>) | null) {
  const guarded = state(target)
  if (guard) guarded.guard = guard
  else delete guarded.guard
}

export function runNavigationGuard(target: EventTarget): Promise<void> {
  const guarded = state(target)
  const guard = guarded.guard
  if (!guard) return Promise.resolve()
  const active = guarded.running
  if (active) return active
  const next = Promise.resolve().then(guard)
  guarded.running = next
  const clear = () => {
    if (guarded.running === next) delete guarded.running
  }
  void next.then(clear, clear)
  return next
}
