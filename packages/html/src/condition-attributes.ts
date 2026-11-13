import type { SourceAttributeFamily } from './source-attributes.ts'

export const CONDITION_ATTRIBUTE = 'data-segnavia-condition'

export function conditionNames(value: string): string[] {
  return value.trim() === '' ? [] : value.trim().split(/\s+/)
}

export const CONDITION_ATTRIBUTE_FAMILY: SourceAttributeFamily = {
  name: 'condition',
  subjectAttributes: [],
  issues: () => [],
}
