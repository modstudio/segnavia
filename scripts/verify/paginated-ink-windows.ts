export interface SequentialWindow {
  flow: string
  column: number
  columns: number
  start: number
  end: number
}

export interface SequentialPair<T extends SequentialWindow> {
  previous: T
  next: T
  previousIndex: number
  nextIndex: number
}

export function galleyInlineOffset(columns: number, flowLeft: number, runLeft?: number): number {
  return columns > 1 && runLeft !== undefined ? Math.max(0, runLeft - flowLeft) : 0
}

export function sequentialPairs<T extends SequentialWindow>(windows: T[]): Array<SequentialPair<T>> {
  const groups = new Map<string, number[]>()
  for (const [index, view] of windows.entries()) {
    const key = `${view.flow}:${view.columns}:${view.column}`
    groups.set(key, [...(groups.get(key) ?? []), index])
  }
  const pairs: Array<SequentialPair<T>> = []
  for (const indexes of groups.values()) {
    const ordered = [...indexes].sort((left, right) => (windows[left]?.start ?? 0) - (windows[right]?.start ?? 0))
    for (let index = 0; index + 1 < ordered.length; index += 1) {
      const previousIndex = ordered[index] ?? 0
      const nextIndex = ordered[index + 1] ?? 0
      const previous = windows[previousIndex]
      const next = windows[nextIndex]
      if (!previous || !next || previous.end > next.start + 0.5) continue
      // Other column runs sit between same-column windows in galley order; only near edges are page breaks.
      if (next.start - previous.end > 40) continue
      pairs.push({ previous, next, previousIndex, nextIndex })
    }
  }
  return pairs
}
