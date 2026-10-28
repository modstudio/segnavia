export class RenderTimeoutError extends Error {
  override name = 'RenderTimeoutError'
}

export interface RenderDeadline {
  signal: AbortSignal
  remaining(): number
}

export async function withinBound<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RenderTimeoutError(`The render did not finish within ${ms / 1000}s. Raise boundMs or simplify the page.`)), ms)
  })
  try {
    return await Promise.race([work, bound])
  } finally {
    clearTimeout(timer)
  }
}

export async function withinRenderDeadline<T>(boundMs: number, work: (deadline: RenderDeadline) => Promise<T>): Promise<T> {
  const expires = Date.now() + boundMs
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new RenderTimeoutError(`The render did not finish within ${boundMs / 1000}s. Raise boundMs or simplify the page.`)
      controller.abort(error)
      reject(error)
    }, boundMs)
  })
  try {
    return await Promise.race([work({ signal: controller.signal, remaining: () => Math.max(0, expires - Date.now()) }), bound])
  } finally {
    clearTimeout(timer)
  }
}

export async function withinRenderPermit<T>(
  boundMs: number,
  acquire: () => Promise<void>,
  release: () => void,
  work: (deadline: RenderDeadline) => Promise<T>,
): Promise<T> {
  await acquire()
  try {
    return await withinRenderDeadline(boundMs, work)
  } finally {
    release()
  }
}
