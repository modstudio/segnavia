export const hasWindow = typeof window !== 'undefined' && typeof location !== 'undefined'

export function defaultSchedule(tick: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }
  const id = setTimeout(tick, 16)
  return () => clearTimeout(id)
}
