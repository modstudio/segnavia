import { ACCEPTANCE_BARS, type BarFacts } from './config.ts'
import type { BarId, BarMeasurement, BarResult, Difference, DocumentResult, SizeMeasurement } from './types.ts'

export function measureBars(facts: BarFacts): Record<BarId, BarResult<BarMeasurement>> {
  return Object.fromEntries(
    ACCEPTANCE_BARS.map((bar) => {
      const measured = bar.measure(facts)
      return [bar.id, { measured, passed: bar.pass(measured, facts), reason: bar.reason(measured, facts) }]
    }),
  ) as Record<BarId, BarResult<BarMeasurement>>
}

export function totalBars(documents: DocumentResult[]): Record<BarId, BarResult<BarMeasurement>> {
  const missingPress = documents.filter((document) => !document.bars.pressColor.measured)
  const missingGrayPress = documents.filter((document) => !document.bars.grayPressColor.measured)
  const failedEffects = documents.flatMap((document) => (document.bars.effects.reason ? [`${document.title}: ${document.bars.effects.reason}`] : []))
  const differences = (id: 'effects' | 'pressColor' | 'grayPressColor'): Difference | undefined => {
    if (id === 'pressColor' && missingPress.length) return undefined
    if (id === 'grayPressColor' && missingGrayPress.length) return undefined
    return documents.reduce(
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
      reason: failedEffects.length ? failedEffects.join('; ') : undefined,
    },
    pressColor: {
      measured: differences('pressColor'),
      passed: documents.every((document) => document.bars.pressColor.passed),
      reason: missingPress.length ? `Missing press measurement: ${missingPress.map((document) => document.title).join(', ')}` : undefined,
    },
    grayPressColor: {
      measured: differences('grayPressColor'),
      passed: documents.every((document) => document.bars.grayPressColor.passed),
      reason: missingGrayPress.length ? `Missing gray press measurement: ${missingGrayPress.map((document) => document.title).join(', ')}` : undefined,
    },
    size: { measured: size, passed: documents.every((document) => document.bars.size.passed) },
  }
}

export function barCell(result: BarResult<BarMeasurement>, id: BarId, total = false): string {
  const bar = ACCEPTANCE_BARS.find((candidate) => candidate.id === id)
  if (!bar) throw new Error(`Unknown acceptance bar: ${id}`)
  const reason = !result.passed && result.reason ? ` — ${result.reason}` : ''
  return `${result.passed ? 'PASS' : 'FAIL'} — ${bar.format(result.measured, total)}${reason}`
}
