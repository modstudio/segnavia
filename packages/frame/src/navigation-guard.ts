const navigationGuardKey = Symbol.for('@segnavia/frame/navigation-guard')

export { parseDeckLoad } from './deck-load-origin.ts'

interface NavigationGuardState {
  guards: Array<(reason: NavigationGuardReason) => void | Promise<void>>
  running?: Promise<void>
}

export type NavigationGuardReason = 'load' | 'navigate'

function state(target: EventTarget): NavigationGuardState {
  const values = target as EventTarget & Record<symbol, NavigationGuardState>
  const existing = values[navigationGuardKey]
  if (existing) return existing
  const created: NavigationGuardState = { guards: [] }
  values[navigationGuardKey] = created
  return created
}

export function addNavigationGuard(target: EventTarget, guard: (reason: NavigationGuardReason) => void | Promise<void>): () => void {
  const guarded = state(target)
  guarded.guards.push(guard)
  return () => {
    const index = guarded.guards.indexOf(guard)
    if (index >= 0) guarded.guards.splice(index, 1)
  }
}

export function runNavigationGuard(target: EventTarget, reason: NavigationGuardReason = 'navigate'): Promise<void> {
  const guarded = state(target)
  if (guarded.guards.length === 0) return Promise.resolve()
  const active = guarded.running
  if (active) return active.then(() => {})
  const guards = [...guarded.guards]
  const next = guards.reduce((ready, guard) => ready.then(() => guard(reason)), Promise.resolve())
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
