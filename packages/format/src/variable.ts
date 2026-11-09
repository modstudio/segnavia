import { z } from 'zod'

export const TextVariable = z.object({
  name: z.string().min(1),
  kind: z.literal('text'),
  from: z.enum(['content', 'section-title']),
  pick: z.enum(['start', 'first', 'last']).default('first'),
})
export const NumberVariable = z.object({
  name: z.string().min(1),
  kind: z.enum(['folio', 'pages']),
  of: z.enum(['numbering', 'document', 'record']).default('numbering'),
})
export const Variable = z.discriminatedUnion('kind', [TextVariable, NumberVariable])

export type Variable = z.infer<typeof Variable>
export type TextVariable = z.infer<typeof TextVariable>
