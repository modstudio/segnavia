const guards = new WeakMap<EventTarget, () => Promise<void>>()
const running = new WeakSet<EventTarget>()

export function setNavigationGuard(target: EventTarget, guard: (() => Promise<void>) | null) {
  if (guard) guards.set(target, guard)
  else guards.delete(target)
}

export async function runNavigationGuard(target: EventTarget) {
  const guard = guards.get(target)
  if (!guard || running.has(target)) return
  running.add(target)
  try {
    await guard()
  } finally {
    running.delete(target)
  }
}
