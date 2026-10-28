import { ACCEPTANCE_BARS, type BarFacts, PRESS_BLEND_THRESHOLD } from './config.ts'
import { worstRegistration } from './registration.ts'
import type { BarId, BarMeasurement, BarResult, Difference, DocumentResult, RegistrationMeasurement, SizeMeasurement } from './types.ts'

export function measureBars(facts: BarFacts): Record<BarId, BarResult<BarMeasurement>> {
  return Object.fromEntries(
    ACCEPTANCE_BARS.map((bar) => {
      const measured = bar.measure(facts)
      const applicable = bar.applicable(facts.kind)
      return [
        bar.id,
        {
          measured,
          passed: !applicable || bar.pass(measured, facts),
          applicable,
          threshold: bar.thresholdFor?.(facts) ?? bar.threshold,
          reason: applicable ? bar.reason(measured, facts) : undefined,
        },
      ]
    }),
  ) as Record<BarId, BarResult<BarMeasurement>>
}

export function totalBars(documents: DocumentResult[]): Record<BarId, BarResult<BarMeasurement>> {
  const judged = documents.filter((document) => !document.faultControl)
  const pressIds = ['pressColor'] as const
  const grayPressIds = ['grayPressColor'] as const
  const missing = (id: (typeof pressIds)[number] | (typeof grayPressIds)[number]) => judged.filter((document) => !document.bars[id].measured)
  const failedEffects = judged.flatMap((document) =>
    document.bars.effects.applicable && document.bars.effects.reason ? [`${document.title}: ${document.bars.effects.reason}`] : [],
  )
  const differences = (id: 'effects' | (typeof pressIds)[number] | (typeof grayPressIds)[number]): Difference | undefined => {
    if (id !== 'effects' && missing(id).length) return undefined
    return judged
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
    pdfBytes: Math.max(...judged.map((document) => document.pdfBytes), 0),
    effectlessPdfBytes: 0,
    multiple: Math.max(...judged.map((document) => (document.bars.size.measured as SizeMeasurement | undefined)?.multiple ?? 0), 0),
  }
  const registrationMeasured = worstRegistration(
    judged.flatMap((document) => {
      const value = document.bars.registration.measured as RegistrationMeasurement | undefined
      return value ? [value] : []
    }),
  )
  const failedRegistration = judged.flatMap((document) =>
    document.bars.registration.applicable && document.bars.registration.reason ? [`${document.title}: ${document.bars.registration.reason}`] : [],
  )
  return {
    effects: {
      measured: differences('effects'),
      passed: judged.every((document) => document.bars.effects.passed),
      applicable: judged.some((document) => document.bars.effects.applicable),
      reason: failedEffects.length ? failedEffects.join('; ') : undefined,
    },
    ...Object.fromEntries(
      [...pressIds, ...grayPressIds].map((id) => {
        const absent = missing(id)
        return [
          id,
          {
            measured: differences(id),
            passed: judged.every((document) => document.bars[id].passed),
            threshold: judged.some((document) => document.kind === 'book') ? { mean: PRESS_BLEND_THRESHOLD.mean } : undefined,
            reason: absent.length ? `Missing press measurement: ${absent.map((document) => document.title).join(', ')}` : undefined,
          },
        ]
      }),
    ),
    size: { measured: size, passed: judged.every((document) => document.bars.size.passed) },
    registration: {
      measured: registrationMeasured,
      passed: judged.every((document) => document.bars.registration.passed),
      applicable: judged.some((document) => document.bars.registration.applicable),
      reason: failedRegistration.length ? failedRegistration.join('; ') : undefined,
    },
  } as Record<BarId, BarResult<BarMeasurement>>
}

export function barCell(result: BarResult<BarMeasurement>, id: BarId, total = false): string {
  const bar = ACCEPTANCE_BARS.find((candidate) => candidate.id === id)
  if (!bar) throw new Error(`Unknown acceptance bar: ${id}`)
  if (result.applicable === false) return `N/A — ${result.reason ?? 'Not applicable.'}`
  const reason = result.reason ? ` — ${result.reason}` : ''
  const formatted = bar.format(result.measured, result.threshold ?? bar.threshold, total)
  return `${result.passed ? 'PASS' : 'FAIL'} — ${formatted}${reason}`
}
