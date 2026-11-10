import { formatHebrewNumeral, formatNumber, isHebrew } from './numbering.ts'
import type { Variable } from './variable.ts'
import { STANDARD_META_FIELD_READERS, type StandardMetaField, type VariableDocumentFacts } from './variable-document-facts.ts'

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
  document?: VariableDocumentFacts
}

export function textVariableValue(variable: Extract<Variable, { kind: 'text' }>, facts: VariablePageFacts): string {
  if (variable.from === 'section-title') return facts.sectionTitle ?? ''
  if (variable.from === 'part-title') {
    return facts.partTitles !== undefined && Object.hasOwn(facts.partTitles, variable.part) ? (facts.partTitles[variable.part] ?? '') : ''
  }
  return ''
}

export function dateVariableValue(variable: Extract<Variable, { kind: 'date' }>, document: VariableDocumentFacts | undefined): string {
  const lang = document?.lang
  const formatter = new Intl.DateTimeFormat(lang, {
    calendar: variable.calendar === 'gregorian' ? 'gregory' : 'hebrew',
    dateStyle: variable.format,
    timeZone: 'UTC',
  })
  const date = new Date(`${variable.date}T00:00:00Z`)
  if (variable.calendar !== 'hebrew' || !isHebrew(lang)) return formatter.format(date)
  return formatter
    .formatToParts(date)
    .map((part) => {
      return hebrewDatePartValue(part)
    })
    .join('')
}

export function hebrewDatePartValue(part: { type: string; value: string }): string {
  if ((part.type !== 'day' && part.type !== 'year') || !/^[0-9]+$/.test(part.value)) return part.value
  return formatHebrewNumeral(Number(part.value), part.type === 'year')
}

export function metaVariableValue(variable: Extract<Variable, { kind: 'meta' }>, document: VariableDocumentFacts | undefined): string {
  const metadata = document?.metadata
  if (!metadata) return ''
  if (Object.hasOwn(STANDARD_META_FIELD_READERS, variable.field))
    return STANDARD_META_FIELD_READERS[variable.field as StandardMetaField](metadata, document.lang)
  return metadata.extra?.[variable.field] ?? ''
}

export function variableValue(variable: Variable, facts: VariablePageFacts): string {
  if (variable.kind === 'text') return textVariableValue(variable, facts)
  if (variable.kind === 'date') return dateVariableValue(variable, facts.document)
  if (variable.kind === 'meta') return metaVariableValue(variable, facts.document)
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
