import { BLOCK_KINDS } from './block-context.ts'
import type { SourceAttributeFamily } from './source-attributes.ts'

export const LINE_NUMBER_ATTRIBUTE_FAMILY: SourceAttributeFamily = {
  name: 'data-line-numbers',
  subjectAttributes: ['data-line-numbers'],
  issues: (where, attribs) => {
    const value = attribs['data-line-numbers']
    if (value === undefined) return []
    const tag = /<([^>]+)>$/.exec(where)?.[1]?.toLowerCase()
    if (tag && !BLOCK_KINDS.has(tag)) return [`${where} data-line-numbers must mark a block element; move it to the containing block to clear this refusal`]
    return value === '' ? [] : [`${where} data-line-numbers is a presence attribute; remove its value to clear this refusal`]
  },
}
