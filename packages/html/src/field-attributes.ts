import type { SourceAttributeFamily } from './source-attributes.ts'

export const FIELD_KINDS = ['checkbox', 'line', 'box'] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

export function fieldLength(value: string): string | undefined {
  const match = /^(\d+(?:\.\d+)?)(em|ch)$/.exec(value)
  if (!match?.[1] || Number(match[1]) <= 0) return undefined
  const canonical = `${Number(match[1])}${match[2]}`
  return canonical === value ? canonical : undefined
}

export function fieldLines(value: string): number | undefined {
  return /^(?:[1-9]|[1-9]\d)$/.test(value) ? Number(value) : undefined
}

const accepted = (attribute: string, value: string, values: string): string =>
  `${attribute} value ${JSON.stringify(value)} is not accepted; use ${values} to clear this refusal`

function fieldKindIssues(where: string, kind: string): string[] {
  const issues: string[] = []
  if (!(FIELD_KINDS as readonly string[]).includes(kind)) issues.push(accepted('data-segnavia-field', kind, `one of ${FIELD_KINDS.join(', ')}`))
  if ((kind === 'checkbox' || kind === 'line') && !/^span$/i.test(where.match(/<([^>]+)>$/)?.[1] ?? ''))
    issues.push(`${where} data-segnavia-field ${kind} needs a span; use a span to clear this refusal`)
  if (kind === 'box' && !/^div$/i.test(where.match(/<([^>]+)>$/)?.[1] ?? ''))
    issues.push(`${where} data-segnavia-field box needs a div; use a div to clear this refusal`)
  return issues
}

function lengthIssue(where: string, kind: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (kind !== 'line') return `${where} data-segnavia-field-length belongs only to a line field; remove it to clear this refusal`
  return fieldLength(value) === undefined ? accepted('data-segnavia-field-length', value, 'a positive number followed by em or ch') : undefined
}

function linesIssue(where: string, kind: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (kind !== 'box') return `${where} data-segnavia-field-lines belongs only to a box field; remove it to clear this refusal`
  return fieldLines(value) === undefined ? accepted('data-segnavia-field-lines', value, 'a whole number from 1 to 99') : undefined
}

function ruleIssue(where: string, kind: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (kind !== 'box') return `${where} data-segnavia-field-rule belongs only to a box field; remove it to clear this refusal`
  return value !== 'ruled' && value !== 'plain' ? accepted('data-segnavia-field-rule', value, 'one of ruled, plain') : undefined
}

function checkedIssues(where: string, kind: string, value: string | undefined): string[] {
  if (value === undefined) return []
  return [
    ...(kind === 'checkbox' ? [] : [`${where} data-segnavia-field-checked belongs only to a checkbox field; remove it to clear this refusal`]),
    ...(value === '' ? [] : [`${where} data-segnavia-field-checked is a presence attribute; remove its value to clear this refusal`]),
  ]
}

export function fieldAttributeIssues(where: string, attribs: Record<string, string>): string[] {
  const kind = attribs['data-segnavia-field']
  if (kind === undefined) {
    const option = ['data-segnavia-field-length', 'data-segnavia-field-lines', 'data-segnavia-field-rule', 'data-segnavia-field-checked'].some(
      (attribute) => attribs[attribute] !== undefined,
    )
    return option ? [`${where} field options have no field; add data-segnavia-field or remove its options to clear this refusal`] : []
  }
  const optionalIssues = [
    lengthIssue(where, kind, attribs['data-segnavia-field-length']),
    linesIssue(where, kind, attribs['data-segnavia-field-lines']),
    ruleIssue(where, kind, attribs['data-segnavia-field-rule']),
  ].filter((issue): issue is string => issue !== undefined)
  const issues = [...fieldKindIssues(where, kind), ...optionalIssues, ...checkedIssues(where, kind, attribs['data-segnavia-field-checked'])]
  return issues.map((issue) => (issue.startsWith(where) ? issue : `${where} ${issue}`))
}

export const FIELD_ATTRIBUTE_FAMILY: SourceAttributeFamily = {
  name: 'field',
  subjectAttributes: [],
  issues: fieldAttributeIssues,
}
