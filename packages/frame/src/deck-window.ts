export function neighborWindow(index: number, length: number): number[] {
  if (length <= 0) return []
  const current = Math.min(Math.max(index, 0), length - 1)
  return [current, current - 1, current + 1].filter((candidate) => candidate >= 0 && candidate < length)
}

export function frameWindow(index: number, length: number, neighbors: boolean, scripts: 'refuse' | 'sandboxed'): number[] {
  const window = neighborWindow(index, length)
  return neighbors && scripts === 'refuse' ? window : window.slice(0, 1)
}

export function indexAfterReload(oldIds: string[], newIds: string[], selectedId: string | null): number {
  if (newIds.length === 0) return 0
  if (selectedId) {
    const moved = newIds.indexOf(selectedId)
    if (moved >= 0) return moved
  }
  const oldIndex = selectedId ? oldIds.indexOf(selectedId) : 0
  return Math.min(Math.max(oldIndex, 0), newIds.length - 1)
}

export function hashSlideIndex(hash: string, prefix: string, length: number): number | null {
  const match = hash.match(new RegExp(`^#${escapeRegExp(prefix)}(-?\\d+)$`))
  if (!match || length <= 0) return null
  const number = Number(match[1])
  if (!Number.isSafeInteger(number)) return null
  return Math.min(Math.max(number - 1, 0), length - 1)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
