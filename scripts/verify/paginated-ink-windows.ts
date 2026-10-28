export interface SequentialWindow {
  flow: string
  column: number
  columns: number
  run?: number
  start: number
  end: number
}

export interface OffsetRange {
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

export function columnGroupKey(view: SequentialWindow): string {
  return `${view.flow}:${view.column}`
}

export function runColumnGroupKey(view: SequentialWindow): string {
  const run = view.run ?? (view.columns > 1 ? 'column-unknown' : 'full')
  return `${view.flow}:${run}:${view.column}`
}

export function groupedWindowIndexes<T extends SequentialWindow>(windows: T[], keyFor: (view: T) => string): number[][] {
  const groups = new Map<string, number[]>()
  for (const [index, view] of windows.entries()) {
    const key = keyFor(view)
    groups.set(key, [...(groups.get(key) ?? []), index])
  }
  return [...groups.values()].map((indexes) => [...indexes].sort((left, right) => (windows[left]?.start ?? 0) - (windows[right]?.start ?? 0)))
}

export function intersectsScaledExtent(edge: OffsetRange, scaled: OffsetRange[]): boolean {
  return scaled.some((extent) => edge.end > extent.start && edge.start < extent.end)
}

export function sequentialPairs<T extends SequentialWindow>(windows: T[]): Array<SequentialPair<T>> {
  const pairs: Array<SequentialPair<T>> = []
  for (const ordered of groupedWindowIndexes(windows, runColumnGroupKey)) {
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
