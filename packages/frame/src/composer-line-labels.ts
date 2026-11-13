import { formatNumber, type Measurements, type NumberSystem, type Plan, type ResolvedLineNumbers, resolveDirection } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { lineKeyedLabels, lineKeyedLabelsScript } from '@segnavia/layout'

interface LineNoteSeries {
  name: string
  system: NumberSystem
}

interface LineLabelValue {
  id: string
  value?: number
  refusal?: string
}

export function lineLabelValues(measurements: Measurements, plan: Plan, settings: ResolvedLineNumbers): LineLabelValue[] {
  return lineKeyedLabels(measurements, plan, settings)
}

export function applyLineLabels(
  measurements: Measurements,
  plan: Plan,
  settings: ResolvedLineNumbers,
  series: readonly LineNoteSeries[],
  doc: Document,
): { refusals: string[]; missing: string[] } {
  const decisions = lineLabelValues(measurements, plan, settings)
  const refusals: string[] = []
  const missing: string[] = []
  for (const decision of decisions) {
    if (decision.refusal) {
      refusals.push(decision.refusal)
      continue
    }
    const labels = doc.querySelectorAll('[data-segnavia-line-label]')
    let label: Element | undefined
    for (let index = 0; index < labels.length; index += 1) {
      if (labels[index]?.getAttribute('data-segnavia-line-label') === decision.id) label = labels[index]
    }
    const number = label?.querySelector('[data-segnavia-line-number]')
    const seriesName = label?.getAttribute('data-segnavia-line-series')
    const system = series.find((candidate) => candidate.name === seriesName)?.system
    if (!number || system === undefined || decision.value === undefined) {
      missing.push(decision.id)
      continue
    }
    const value = formatNumber(decision.value, system)
    number.textContent = value
    number.setAttribute('dir', resolveDirection(undefined, undefined, value))
  }
  return { refusals, missing }
}

export function unsettledLineLabels(
  measurements: Measurements,
  plan: Plan,
  settings: ResolvedLineNumbers,
  series: readonly LineNoteSeries[],
  doc: Document,
): { refusals: string[]; moved: string[] } {
  const decisions = lineLabelValues(measurements, plan, settings)
  const refusals: string[] = []
  const moved: string[] = []
  const labels = doc.querySelectorAll('[data-segnavia-line-label]')
  for (const decision of decisions) {
    if (decision.refusal) {
      refusals.push(decision.refusal)
      continue
    }
    let label: Element | undefined
    for (let index = 0; index < labels.length; index += 1) {
      if (labels[index]?.getAttribute('data-segnavia-line-label') === decision.id) label = labels[index]
    }
    const number = label?.querySelector('[data-segnavia-line-number]')
    const seriesName = label?.getAttribute('data-segnavia-line-series')
    const system = series.find((candidate) => candidate.name === seriesName)?.system
    if (!number || system === undefined || decision.value === undefined || number.textContent !== formatNumber(decision.value, system)) moved.push(decision.id)
  }
  return { refusals, moved }
}

export function embeddedComposerLineLabelFunctions(): string {
  return `${lineKeyedLabelsScript()}\n${embedFunction('lineLabelValues', lineLabelValues)}\n${embedFunction('applyLineLabels', applyLineLabels)}\n${embedFunction(
    'unsettledLineLabels',
    unsettledLineLabels,
  )}`
}
