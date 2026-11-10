import { formatNumber } from './numbering.ts'
import type { Variable } from './variable.ts'

export interface VariablePageFacts {
  folio?: string | null
  documentFolio?: string | null
  numberingTotal: string
  documentTotal: string
  recordIndex?: number
  recordCount?: number
  recordFolio?: string
  recordTotal?: string
  sectionTitle?: string
  partTitles?: Record<string, string>
}

export function textVariableValue(variable: Extract<Variable, { kind: 'text' }>, facts: VariablePageFacts): string {
  if (variable.from === 'section-title') return facts.sectionTitle ?? ''
  if (variable.from === 'part-title') {
    return facts.partTitles !== undefined && Object.hasOwn(facts.partTitles, variable.part) ? (facts.partTitles[variable.part] ?? '') : ''
  }
  return ''
}

export function variableValue(variable: Variable, facts: VariablePageFacts): string {
  if (variable.kind === 'text') return textVariableValue(variable, facts)
  if (variable.kind === 'record') {
    const value = variable.value === 'index' ? facts.recordIndex : facts.recordCount
    return value === undefined ? '' : formatNumber(value, variable.system ?? 'arabic')
  }
  if (variable.kind === 'folio') {
    if (variable.of === 'numbering') return facts.folio ?? ''
    if (variable.of === 'document') return facts.documentFolio ?? ''
    return facts.recordFolio ?? ''
  }
  if (variable.of === 'numbering') return facts.numberingTotal
  if (variable.of === 'document') return facts.documentTotal
  return facts.recordTotal ?? ''
}
