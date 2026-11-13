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

export function fieldAttributeIssues(where: string, attribs: Record<string, string>): string[] {
  const kind = attribs['data-segnavia-field']
  const length = attribs['data-segnavia-field-length']
  const lines = attribs['data-segnavia-field-lines']
  const rule = attribs['data-segnavia-field-rule']
  const checked = attribs['data-segnavia-field-checked']
  const issues: string[] = []
  if (kind === undefined) {
    if (length !== undefined || lines !== undefined || rule !== undefined || checked !== undefined)
      issues.push(`${where} field options have no field; add data-segnavia-field or remove its options to clear this refusal`)
    return issues
  }
  if (!(FIELD_KINDS as readonly string[]).includes(kind)) issues.push(accepted('data-segnavia-field', kind, `one of ${FIELD_KINDS.join(', ')}`))
  if ((kind === 'checkbox' || kind === 'line') && !/^span$/i.test(where.match(/<([^>]+)>$/)?.[1] ?? ''))
    issues.push(`${where} data-segnavia-field ${kind} needs a span; use a span to clear this refusal`)
  if (kind === 'box' && !/^div$/i.test(where.match(/<([^>]+)>$/)?.[1] ?? ''))
    issues.push(`${where} data-segnavia-field box needs a div; use a div to clear this refusal`)
  if (length !== undefined && (kind !== 'line' || fieldLength(length) === undefined))
    issues.push(
      kind === 'line'
        ? accepted('data-segnavia-field-length', length, 'a positive number followed by em or ch')
        : `${where} data-segnavia-field-length belongs only to a line field; remove it to clear this refusal`,
    )
  if (lines !== undefined && (kind !== 'box' || fieldLines(lines) === undefined))
    issues.push(
      kind === 'box'
        ? accepted('data-segnavia-field-lines', lines, 'a whole number from 1 to 99')
        : `${where} data-segnavia-field-lines belongs only to a box field; remove it to clear this refusal`,
    )
  if (rule !== undefined && (kind !== 'box' || (rule !== 'ruled' && rule !== 'plain')))
    issues.push(
      kind === 'box'
        ? accepted('data-segnavia-field-rule', rule, 'one of ruled, plain')
        : `${where} data-segnavia-field-rule belongs only to a box field; remove it to clear this refusal`,
    )
  if (checked !== undefined && kind !== 'checkbox')
    issues.push(`${where} data-segnavia-field-checked belongs only to a checkbox field; remove it to clear this refusal`)
  if (checked !== undefined && checked !== '')
    issues.push(`${where} data-segnavia-field-checked is a presence attribute; remove its value to clear this refusal`)
  return issues.map((issue) => (issue.startsWith(where) ? issue : `${where} ${issue}`))
}

export const FIELD_ATTRIBUTE_FAMILY: SourceAttributeFamily = {
  name: 'field',
  subjectAttributes: [],
  issues: fieldAttributeIssues,
}
