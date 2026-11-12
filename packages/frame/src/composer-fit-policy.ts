import type { FitMeasurement, FitStrategy, PreflightEntry } from '@segnavia/format'
import type { FitSearchStrategy } from '@segnavia/layout'

export interface FitDecision {
  id: string
  group?: string
  values: Readonly<Record<FitStrategy, number>>
  authored: Readonly<Record<FitStrategy, number>>
  units: Readonly<Record<FitStrategy, string>>
  stopped?: { strategy: FitStrategy; bound: number; excess: number }
}

export interface FitApplication {
  styles: Partial<Record<'fontSize' | 'lineHeight' | 'letterSpacing', string>>
  shrunk: boolean
}

function fitValue(text: string, strategy: FitStrategy, absolutePx: Readonly<Record<string, number>>) {
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([a-z]+)?$/i.exec(text)
  if (!match) return undefined
  const amount = Number(match[1])
  const unit = (match[2] ?? '').toLowerCase()
  if (strategy === 'leading' && unit === '') return { value: amount, unit }
  const factor = absolutePx[unit]
  return factor === undefined ? undefined : { value: amount * factor, unit: 'px' }
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
  const bounds = strategies.flatMap((strategy, index) => {
    const fallback = strategy === 'tracking' ? '0px' : strategy === 'leading' ? '1' : '1px'
    const min = fitValue(mins[index] ?? fallback, strategy, absolutePx)
    const max = maxes[index] ? fitValue(maxes[index] as string, strategy, absolutePx) : { value: authored[strategy], unit: units[strategy] }
    const step = steps[index] ? fitValue(steps[index] as string, strategy, absolutePx) : undefined
    if (!min || !max) return []
    units[strategy] = min.unit
    return [{ strategy, authored: authored[strategy], min: min.value, max: max.value, ...(step ? { step: step.value } : {}) }]
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

export function reduceDocumentFits(
  decisions: readonly FitDecision[],
  reduceGroups: <T extends { group?: string; values: Readonly<Record<string, number>> }>(results: readonly T[]) => T[],
): FitDecision[] {
  return reduceGroups(decisions) as FitDecision[]
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
