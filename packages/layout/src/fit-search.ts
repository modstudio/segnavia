import type { FitStrategy } from '@segnavia/format'

export interface FitSearchStrategy {
  strategy: FitStrategy
  authored: number
  min: number
  max?: number
  step?: number
}

export interface FitSearchResult {
  values: Readonly<Record<FitStrategy, number>>
  stopped?: { strategy: FitStrategy; bound: number; excess: number }
}

export type FitProbe = (values: Readonly<Record<FitStrategy, number>>) => { fits: boolean; excess: number }

export function fitSearch(strategies: readonly FitSearchStrategy[], probe: FitProbe): FitSearchResult {
  const values = Object.fromEntries(strategies.map((entry) => [entry.strategy, entry.max ?? entry.authored])) as Record<FitStrategy, number>
  let measured = probe(values)
  if (measured.fits) return { values }

  for (const entry of strategies) {
    const step = entry.step ?? 0.01
    let low = entry.min
    let high = values[entry.strategy]
    let best = low
    values[entry.strategy] = low
    const atBound = probe(values)
    if (!atBound.fits) {
      measured = atBound
      continue
    }
    while (high - low > step) {
      const raw = (low + high) / 2
      const candidate = entry.step ? entry.min + Math.floor((raw - entry.min) / step) * step : raw
      values[entry.strategy] = candidate
      measured = probe(values)
      if (measured.fits) {
        best = candidate
        low = candidate
      } else high = candidate
    }
    values[entry.strategy] = best
    return { values }
  }
  const last = strategies.at(-1)
  return last ? { values, stopped: { strategy: last.strategy, bound: last.min, excess: measured.excess } } : { values }
}

export function reduceFitGroups<T extends { group?: string; values: Readonly<Record<string, number>> }>(results: readonly T[]): T[] {
  const minima = new Map<string, Record<string, number>>()
  for (const result of results) {
    if (!result.group) continue
    const held = minima.get(result.group) ?? {}
    for (const [strategy, value] of Object.entries(result.values)) held[strategy] = Math.min(held[strategy] ?? value, value)
    minima.set(result.group, held)
  }
  return results.map((result) => (result.group ? { ...result, values: { ...result.values, ...minima.get(result.group) } } : result))
}
