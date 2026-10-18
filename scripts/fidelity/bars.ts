import { ACCEPTANCE_BARS, type BarFacts } from './config.ts'
import type { BarId, BarMeasurement, BarResult, Difference, DocumentResult, SizeMeasurement } from './types.ts'

export function measureBars(facts: BarFacts): Record<BarId, BarResult<BarMeasurement>> {
  return Object.fromEntries(
    ACCEPTANCE_BARS.map((bar) => {
      const measured = bar.measure(facts)
      return [
        bar.id,
        {
          measured,
          passed: bar.pass(measured, facts),
          applicable: bar.id !== 'effects' || facts.kind === 'effects',
          threshold: bar.thresholdFor?.(facts) ?? bar.threshold,
          reason: bar.reason(measured, facts),
        },
      ]
    }),
  ) as Record<BarId, BarResult<BarMeasurement>>
}

export function totalBars(documents: DocumentResult[]): Record<BarId, BarResult<BarMeasurement>> {
  const pressIds = ['pressColor'] as const
  const grayPressIds = ['grayPressColor'] as const
  const missing = (id: (typeof pressIds)[number] | (typeof grayPressIds)[number]) => documents.filter((document) => !document.bars[id].measured)
  const failedEffects = documents.flatMap((document) =>
    document.bars.effects.applicable && document.bars.effects.reason ? [`${document.title}: ${document.bars.effects.reason}`] : [],
  )
  const differences = (id: 'effects' | (typeof pressIds)[number] | (typeof grayPressIds)[number]): Difference | undefined => {
    if (id !== 'effects' && missing(id).length) return undefined
    return documents
      .filter((document) => id !== 'effects' || document.bars.effects.applicable)
      .reduce(
        (worst, document) => {
          const value = document.bars[id].measured as Difference | undefined
          return { mean: Math.max(worst.mean, value?.mean ?? 0), p99: Math.max(worst.p99, value?.p99 ?? 0) }
        },
        { mean: 0, p99: 0 },
      )
  }
  const size: SizeMeasurement = {
    pdfBytes: Math.max(...documents.map((document) => document.pdfBytes), 0),
    effectlessPdfBytes: 0,
    multiple: Math.max(...documents.map((document) => (document.bars.size.measured as SizeMeasurement | undefined)?.multiple ?? 0), 0),
  }
  return {
    effects: {
      measured: differences('effects'),
      passed: documents.every((document) => document.bars.effects.passed),
      applicable: documents.some((document) => document.bars.effects.applicable),
      reason: failedEffects.length ? failedEffects.join('; ') : undefined,
    },
    ...Object.fromEntries(
      [...pressIds, ...grayPressIds].map((id) => {
        const absent = missing(id)
        return [
          id,
          {
            measured: differences(id),
            passed: documents.every((document) => document.bars[id].passed),
            reason: absent.length ? `Missing press measurement: ${absent.map((document) => document.title).join(', ')}` : undefined,
          },
        ]
      }),
    ),
    size: { measured: size, passed: documents.every((document) => document.bars.size.passed) },
  } as Record<BarId, BarResult<BarMeasurement>>
}

export function barCell(result: BarResult<BarMeasurement>, id: BarId, total = false): string {
  const bar = ACCEPTANCE_BARS.find((candidate) => candidate.id === id)
  if (!bar) throw new Error(`Unknown acceptance bar: ${id}`)
  if (result.applicable === false) return `N/A — ${result.reason ?? 'Not applicable.'}`
  const reason = !result.passed && result.reason ? ` — ${result.reason}` : ''
  const threshold = result.threshold
  const formatted =
    threshold && 'mean' in threshold
      ? `${differenceValue(result.measured)} / mean ≤ ${threshold.mean}, p99 ≤ ${threshold.p99}`
      : bar.format(result.measured, total)
  return `${result.passed ? 'PASS' : 'FAIL'} — ${formatted}${reason}`
}

function differenceValue(measured: BarMeasurement | undefined): string {
  const value = measured as Difference | undefined
  return `mean ${value?.mean.toFixed(2) ?? '—'}, p99 ${value?.p99.toFixed(2) ?? '—'}`
}
