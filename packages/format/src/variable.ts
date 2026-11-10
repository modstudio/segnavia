import { z } from 'zod'
import { refineLibraryNames } from './library-names.ts'

export const TextVariableBase = {
  name: z.string().min(1),
  kind: z.literal('text'),
  pick: z.enum(['start', 'first', 'last']).default('first'),
}
export const TextVariableFrom = z.enum(['content', 'section-title', 'part-title'])

export const ContentTextVariable = z.object({ ...TextVariableBase, from: z.literal('content'), part: z.never().optional() })
export const SectionTitleTextVariable = z.object({ ...TextVariableBase, from: z.literal('section-title'), part: z.never().optional() })
export const PartTitleTextVariable = z.object({ ...TextVariableBase, from: z.literal('part-title'), part: z.string().min(1) })
export const TextVariable = z.discriminatedUnion('from', [ContentTextVariable, SectionTitleTextVariable, PartTitleTextVariable])
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
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
export const DateVariable = z.object({
  name: z.string().min(1),
  kind: z.literal('date'),
  date: z.string().superRefine((date, ctx) => {
    const match = ISO_DATE.exec(date)
    const parsed = match ? new Date(`${date}T00:00:00Z`) : undefined
    if (
      !match ||
      !parsed ||
      Number.isNaN(parsed.valueOf()) ||
      parsed.getUTCFullYear() !== Number(match[1]) ||
      parsed.getUTCMonth() + 1 !== Number(match[2]) ||
      parsed.getUTCDate() !== Number(match[3])
    )
      ctx.addIssue({ code: 'custom', message: `date ${JSON.stringify(date)} is not a real ISO YYYY-MM-DD date; provide a real date to clear this refusal` })
  }),
  calendar: z.enum(['gregorian', 'hebrew'], { error: 'unknown date calendar; use gregorian or hebrew to clear this refusal' }),
  format: z.enum(['long', 'short'], { error: 'unknown date format; use long or short to clear this refusal' }),
})
export const MetaVariable = z.object({ name: z.string().min(1), kind: z.literal('meta'), field: z.string().min(1) })
export const Variable = z.union([TextVariable, NumberVariable, RecordVariable, DateVariable, MetaVariable])

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
