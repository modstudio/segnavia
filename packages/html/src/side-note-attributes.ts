import type { SourceAttributeFamily } from './source-attributes.ts'

export const SIDE_NOTE_ATTRIBUTE_FAMILY: SourceAttributeFamily = {
  name: 'data-side-note',
  subjectAttributes: ['data-side-note'],
  issues: (where, attribs) => {
    const value = attribs['data-side-note']
    if (value === undefined) return []
    return value === '' ? [] : [`${where} data-side-note is a presence attribute; remove its value to clear this refusal`]
  },
}
