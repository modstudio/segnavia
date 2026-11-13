import {
  formatNumber,
  type LineNoteSeries,
  type Measurements,
  type NumberSystem,
  type Plan,
  type ResolvedLineNumbers,
  resolveDirection,
} from '@segnavia/format'
import { type LineKeyedLabelDecision, lineKeyedLabels } from '@segnavia/layout'

interface ResolvedLineLabel {
  number: Element
  system: NumberSystem
  value: string
}

export function galleyLineLabels(doc: Document): Map<string, Element> {
  const result = new Map<string, Element>()
  const labels = doc.querySelectorAll('[data-segnavia-galleys] [data-segnavia-line-label]')
  for (const label of labels) {
    const id = label.getAttribute('data-segnavia-line-label')
    if (id !== null) result.set(id, label)
  }
  return result
}

export function resolvedLineLabel(
  labels: ReadonlyMap<string, Element>,
  decision: LineKeyedLabelDecision,
  series: readonly LineNoteSeries[],
): ResolvedLineLabel | undefined {
  if ('refusal' in decision) return undefined
  const label = labels.get(decision.id)
  const number = label?.querySelector('[data-segnavia-line-label-number]')
  const seriesName = label?.getAttribute('data-segnavia-line-series')
  const system = series.find((candidate) => candidate.name === seriesName)?.system
  if (!number || system === undefined) return undefined
  return { number, system, value: formatNumber(decision.value, system) }
}

export function applyLineLabels(
  measurements: Measurements,
  plan: Plan,
  settings: ResolvedLineNumbers,
  series: readonly LineNoteSeries[],
  doc: Document,
): { refusals: string[]; missing: string[] } {
  const decisions = lineKeyedLabels(measurements, plan, settings)
  const labels = galleyLineLabels(doc)
  const refusals: string[] = []
  const missing: string[] = []
  const decided = new Set<string>()
  for (const decision of decisions) {
    decided.add(decision.id)
    if ('refusal' in decision) {
      refusals.push(decision.refusal)
      continue
    }
    const resolved = resolvedLineLabel(labels, decision, series)
    if (!resolved) {
      missing.push(decision.id)
      continue
    }
    resolved.number.textContent = resolved.value
    resolved.number.setAttribute('dir', resolveDirection(undefined, undefined, resolved.value))
  }
  for (const id of labels.keys()) if (!decided.has(id)) missing.push(id)
  return { refusals, missing }
}

export function unsettledLineLabels(
  measurements: Measurements,
  plan: Plan,
  settings: ResolvedLineNumbers,
  series: readonly LineNoteSeries[],
  doc: Document,
): { refusals: string[]; moved: string[] } {
  const decisions = lineKeyedLabels(measurements, plan, settings)
  const labels = galleyLineLabels(doc)
  const refusals: string[] = []
  const moved: string[] = []
  for (const decision of decisions) {
    if ('refusal' in decision) {
      refusals.push(decision.refusal)
      continue
    }
    const resolved = resolvedLineLabel(labels, decision, series)
    if (!resolved || resolved.number.textContent !== resolved.value) moved.push(decision.id)
  }
  return { refusals, moved }
}
