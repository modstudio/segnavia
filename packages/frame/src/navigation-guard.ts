const guards = new WeakMap<EventTarget, () => Promise<void>>()
const running = new WeakMap<EventTarget, Promise<void>>()

export function setNavigationGuard(target: EventTarget, guard: (() => Promise<void>) | null) {
  if (guard) guards.set(target, guard)
  else guards.delete(target)
}

export function runNavigationGuard(target: EventTarget): Promise<void> {
  const guard = guards.get(target)
  if (!guard) return Promise.resolve()
  const active = running.get(target)
  if (active) return active
  const next = Promise.resolve().then(guard)
  running.set(target, next)
  const clear = () => {
    if (running.get(target) === next) running.delete(target)
  }
  void next.then(clear, clear)
  return next
}
