import type { SourceAttributeFamily } from './source-attributes.ts'

export const LEMMA_ATTRIBUTE_FAMILY: SourceAttributeFamily = {
  name: 'data-lemma',
  subjectAttributes: ['data-lemma'],
  issues(where, attribs) {
    const value = attribs['data-lemma']
    if (value === undefined) return []
    return value === '' ? [] : [`${where} data-lemma is a presence attribute; remove its value to clear this refusal`]
  },
}
