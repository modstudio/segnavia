import { z } from 'zod'
import { refineLibraryNames, withLibraryDefaults } from './library-names.ts'

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
export const RecordVariable = z.object({
  name: z.string().min(1),
  kind: z.literal('record'),
  value: z.enum(['index', 'count']),
  system: z.enum(['arabic', 'roman-lower', 'roman-upper', 'hebrew']).optional(),
})
export const Variable = z.discriminatedUnion('kind', [TextVariable, NumberVariable, RecordVariable])

export type Variable = z.infer<typeof Variable>
export type TextVariable = z.infer<typeof TextVariable>
export type RecordVariable = z.infer<typeof RecordVariable>

export const LIBRARY_VARIABLES: Variable[] = [
  Variable.parse({ name: 'segnavia:section-title', kind: 'text', from: 'section-title', pick: 'first' }),
  Variable.parse({ name: 'segnavia:folio', kind: 'folio' }),
  Variable.parse({ name: 'segnavia:pages-total', kind: 'pages' }),
]

export const Variables = z
  .array(Variable)
  .default([])
  .superRefine((variables, ctx) => refineLibraryNames('variable', variables, ctx))
  .transform((variables) => withLibraryDefaults(LIBRARY_VARIABLES, variables))
