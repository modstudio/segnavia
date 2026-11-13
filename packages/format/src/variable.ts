import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { refineLibraryNames } from './library-names.ts'

export const TextVariableBase = {
  name: z.string().min(1),
  kind: z.literal('text'),
  pick: z.enum(['start', 'first', 'last']).default('first'),
}
export const TextVariableFrom = z.enum(['content', 'section-title', 'part-title'])

export const ContentTextVariable = closedObject({ ...TextVariableBase, from: z.literal('content'), part: z.never().optional() })
export const SectionTitleTextVariable = closedObject({ ...TextVariableBase, from: z.literal('section-title'), part: z.never().optional() })
export const PartTitleTextVariable = closedObject({ ...TextVariableBase, from: z.literal('part-title'), part: z.string().min(1) })
export const TextVariable = z.discriminatedUnion('from', [ContentTextVariable, SectionTitleTextVariable, PartTitleTextVariable])
export const NumberVariable = closedObject({
  name: z.string().min(1),
  kind: z.enum(['folio', 'pages']),
  of: z.enum(['numbering', 'document', 'record']).default('numbering'),
})
export const RecordVariable = closedObject({
  name: z.string().min(1),
  kind: z.literal('record'),
  value: z.enum(['index', 'count']),
  system: z.enum(['arabic', 'roman-lower', 'roman-upper', 'hebrew']).optional(),
})
export const MetaVariable = closedObject({ name: z.string().min(1), kind: z.literal('meta'), field: z.string().min(1) })
export const Variable = z.union([TextVariable, NumberVariable, RecordVariable, MetaVariable])

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
  .superRefine((variables, ctx) => refineLibraryNames('variable', variables, ctx))
  .default([])
