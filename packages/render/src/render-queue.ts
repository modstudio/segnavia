import { rendererClosed } from './errors.ts'

export function renderQueue(limit: number): { acquire: () => Promise<void>; release: () => void; close: () => void } {
  let running = 0
  let closed = false
  const waiting: Array<{ resolve: () => void; reject: (error: unknown) => void }> = []

  const acquire = (): Promise<void> => {
    if (closed) return Promise.reject(rendererClosed())
    if (running < limit) {
      running++
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      waiting.push({ resolve, reject })
    })
  }

  const release = () => {
    if (closed) {
      running--
      return
    }
    const next = waiting.shift()
    if (next) next.resolve()
    else running--
  }

  const close = () => {
    closed = true
    const error = rendererClosed()
    for (const waiter of waiting) waiter.reject(error)
    waiting.length = 0
  }

  return { acquire, release, close }
}
