import { FitAxis, type FitMeasurement, type FitStrategy, type PreflightEntry } from '@segnavia/format'
import { parseCssLength } from '@segnavia/html'
import type { FitSearchStrategy } from '@segnavia/layout'

export interface FitDecision {
  id: string
  group?: string
  values: Readonly<Record<FitStrategy, number>>
  authored: Readonly<Record<FitStrategy, number>>
  units: Readonly<Record<FitStrategy, string>>
  stopped?: { strategy: FitStrategy; bound: number; excess: number }
}

export const FIT_AXES: readonly FitAxis[] = FitAxis.options

export interface FitApplication {
  styles: Partial<Record<'fontSize' | 'lineHeight' | 'letterSpacing', string>>
  shrunk: boolean
}

export interface FitStageState<T> {
  done: boolean
  results: T
}

export function runFitStageOnce<T>(state: FitStageState<T>, execute: () => T): T {
  if (state.done) return state.results
  state.done = true
  state.results = execute()
  return state.results
}

export function fitAxis(authored: string | null, slot: boolean, axes: readonly FitAxis[] = FIT_AXES): FitAxis {
  const shared = (globalThis as typeof globalThis & { FIT_AXES?: readonly FitAxis[] }).FIT_AXES ?? axes
  return shared.find((axis) => axis === authored) ?? (slot ? 'both' : 'block')
}

export function fitValue(text: string, strategy: FitStrategy, absolutePx: Readonly<Record<string, number>>) {
  const parser = (globalThis as typeof globalThis & { parseCssLength?: typeof parseCssLength }).parseCssLength ?? parseCssLength
  const parsed = parser(text)
  if (!parsed) return undefined
  if (strategy === 'leading' && parsed.unit === '') return { value: parsed.value, unit: parsed.unit }
  const factor = absolutePx[parsed.unit]
  return factor === undefined ? undefined : { value: parsed.value * factor, unit: 'px' }
}

export function fitBounds(
  strategies: readonly FitStrategy[],
  mins: readonly string[],
  maxes: readonly string[],
  steps: readonly string[],
  authored: Readonly<Record<FitStrategy, number>>,
  absolutePx: Readonly<Record<string, number>>,
): { bounds: FitSearchStrategy[]; units: Record<FitStrategy, string> } | undefined {
  const units: Record<FitStrategy, string> = { size: 'px', leading: '', tracking: 'px' }
  const readValue = (globalThis as typeof globalThis & { fitValue?: typeof fitValue }).fitValue ?? fitValue
  const bounds = strategies.flatMap((strategy, index) => {
    const fallback = strategy === 'tracking' ? '0px' : strategy === 'leading' ? '1' : '1px'
    const min = readValue(mins[index] ?? fallback, strategy, absolutePx)
    const max = maxes[index] ? readValue(maxes[index] as string, strategy, absolutePx) : { value: authored[strategy], unit: units[strategy] }
    const step = steps[index] ? readValue(steps[index] as string, strategy, absolutePx) : undefined
    if (!min || !max) return []
    const normalize = (held: { value: number; unit: string }) =>
      strategy === 'leading' && held.unit === 'px' ? Math.max(1, held.value / authored.size) : strategy === 'leading' ? Math.max(1, held.value) : held.value
    const normalizedStep = step && strategy === 'leading' && step.unit === 'px' ? step.value / authored.size : step?.value
    return [{ strategy, authored: authored[strategy], min: normalize(min), max: normalize(max), ...(normalizedStep ? { step: normalizedStep } : {}) }]
  })
  return bounds.length === strategies.length ? { bounds, units } : undefined
}

export function fitApplication(decision: FitDecision): FitApplication {
  const styles: FitApplication['styles'] = {}
  for (const [strategy, value] of Object.entries(decision.values) as Array<[FitStrategy, number]>) {
    if (strategy === 'size') styles.fontSize = `${value}px`
    else if (strategy === 'leading') styles.lineHeight = decision.units.leading === '' ? String(value) : `${value}px`
    else styles.letterSpacing = `${value}px`
  }
  return { styles, shrunk: decision.values.size !== undefined && decision.values.size < decision.authored.size - 0.01 }
}

export function fitMeasurements(decisions: readonly FitDecision[]): FitMeasurement[] {
  return decisions
    .filter((decision, index, all) => all.findIndex((candidate) => candidate.id === decision.id) === index)
    .map((decision) => ({
      id: decision.id,
      ...(decision.group ? { group: decision.group } : {}),
      values: Object.entries(decision.values).map(([strategy, value]) => ({
        strategy: strategy as FitStrategy,
        value,
        unit: decision.units[strategy as FitStrategy],
      })),
      ...(decision.stopped ? { stopped: decision.stopped } : {}),
    }))
}

export function fitLimitEntry(fit: Pick<FitMeasurement, 'id' | 'stopped'>): PreflightEntry | undefined {
  const stopped = fit.stopped
  if (!stopped) return undefined
  return {
    check: 'fit-limit',
    subject: fit.id,
    message: `Fit ${fit.id} exhausted ${stopped.strategy} at ${stopped.bound} with ${stopped.excess}px excess; enlarge the fit box or lower the bound to clear it.`,
  }
}
