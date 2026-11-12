import { MEASURE_KINDS } from '@segnavia/format'
import type { SourceAttributeFamily } from './source-attributes.ts'

const CUSTOM_PROPERTY = /^--[-_a-zA-Z\u0080-\u{10ffff}][-_a-zA-Z0-9\u0080-\u{10ffff}]*$/u

export function measureAttributeIssues(where: string, attribs: Record<string, string>): string[] {
  const measure = attribs['data-measure']
  const name = attribs['data-measure-as']
  if (measure === undefined && name === undefined) return []
  const issues: string[] = []
  if (!MEASURE_KINDS.includes(measure as (typeof MEASURE_KINDS)[number])) {
    issues.push(`${where} data-measure ${JSON.stringify(measure ?? '')} is invalid; use ${MEASURE_KINDS.join(', ')} to clear this refusal`)
  }
  if (name === undefined || !CUSTOM_PROPERTY.test(name)) {
    issues.push(`${where} data-measure-as ${JSON.stringify(name ?? '')} is invalid; use a CSS custom property name beginning with -- to clear this refusal`)
  }
  return issues
}

export const MEASURE_ATTRIBUTE_FAMILY: SourceAttributeFamily = {
  name: 'data-measure',
  subjectAttributes: ['data-measure', 'data-measure-as'],
  issues: measureAttributeIssues,
}
