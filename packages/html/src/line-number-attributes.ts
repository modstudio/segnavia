import type { SourceAttributeFamily } from './source-attributes.ts'

export const LINE_NUMBER_ATTRIBUTE_FAMILY: SourceAttributeFamily = {
  name: 'data-line-numbers',
  subjectAttributes: ['data-line-numbers'],
  issues: (_where, attribs) => {
    const value = attribs['data-line-numbers']
    return value === undefined || value === '' ? [] : ['data-line-numbers is a presence attribute; remove its value to clear this refusal']
  },
}
