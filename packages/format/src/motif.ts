import { z } from 'zod'
import { FontReference, FontReferenceInput } from './fonts.ts'
import { SlotKey } from './slots.ts'

export const MOTIF_ATTRIBUTE = 'data-motif'
export const PRINTED_PAGE_CONTEXT = 'printedPage'
export const PRINTED_PAGE_NUMBER_PATH = `${PRINTED_PAGE_CONTEXT}.number`
export const PRINTED_PAGE_TOTAL_PATH = `${PRINTED_PAGE_CONTEXT}.total`
export const PRINTED_PAGE_FOLIO_PATH = `${PRINTED_PAGE_CONTEXT}.folio`
export const PRINTED_PAGE_RUNNING_HEAD_PATH = `${PRINTED_PAGE_CONTEXT}.runningHead`
export const LIBRARY_MOTIF_PREFIX = 'segnavia:'
export const BOOK_FURNITURE = [
  { key: 'segnavia:folio', path: PRINTED_PAGE_FOLIO_PATH, value: 'folio', className: 'segnavia-folio', region: 'foot', fields: [] },
  {
    key: 'segnavia:running-head',
    path: PRINTED_PAGE_RUNNING_HEAD_PATH,
    value: 'runningHead',
    className: 'segnavia-running-head',
    region: 'head',
    fields: [],
  },
  {
    key: 'segnavia:mark',
    className: 'segnavia-mark',
    region: 'head',
    fields: [
      { key: 'name', required: true },
      { key: 'which', choices: ['first', 'last'], default: 'first' },
    ],
  },
] as const
export type BookFurniture = (typeof BOOK_FURNITURE)[number]
export const motifFieldAttribute = (key: string) => `${MOTIF_ATTRIBUTE}-${key}`

const uniqueChoices = (field: { choices?: string[]; default?: string }, ctx: z.RefinementCtx) => {
  if (field.choices && new Set(field.choices).size !== field.choices.length) {
    ctx.addIssue({ code: 'custom', path: ['choices'], message: 'choices must be unique' })
  }
  if (field.choices && field.default !== undefined && !field.choices.includes(field.default)) {
    ctx.addIssue({ code: 'custom', path: ['default'], message: 'default must be one of the field choices' })
  }
}

const MotifFieldShape = {
  key: SlotKey,
  label: z.string().min(1),
  choices: z.array(z.string()).min(1).optional(),
  default: z.string().optional(),
  required: z.boolean().default(false),
} as const

export const MotifField = z.object(MotifFieldShape).superRefine(uniqueChoices)
export type MotifField = z.infer<typeof MotifField>
export const MotifFieldInput = z.strictObject(MotifFieldShape).superRefine(uniqueChoices)
export type MotifFieldInput = z.input<typeof MotifFieldInput>

const MotifVersionShape = {
  lang: z.string().min(1),
  dir: z.enum(['ltr', 'rtl']).optional(),
  when: z.record(SlotKey, z.string()).optional(),
  html: z.string(),
} as const

export const MotifVersion = z.object(MotifVersionShape)
export type MotifVersion = z.infer<typeof MotifVersion>
export const MotifVersionInput = z.strictObject(MotifVersionShape)
export type MotifVersionInput = z.input<typeof MotifVersionInput>

const validateMotif = (motif: { fields: MotifField[]; versions: MotifVersion[] }, ctx: z.RefinementCtx) => {
  const fields = new Map(motif.fields.map((field) => [field.key, field]))
  const fieldCases = new Map<string, number>()
  motif.fields.forEach((field, index) => {
    const normalized = field.key.toLowerCase()
    if (field.key.toLowerCase() === 'lang') {
      ctx.addIssue({ code: 'custom', path: ['fields', index, 'key'], message: 'lang is always present and must not be declared' })
    }
    const previous = fieldCases.get(normalized)
    if (previous !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['fields', index, 'key'], message: `field key differs only by case from field ${previous + 1}` })
    } else fieldCases.set(normalized, index)
  })
  const seen = new Map<string, number>()
  motif.versions.forEach((version, index) => {
    for (const [key, value] of Object.entries(version.when ?? {})) {
      const field = fields.get(key)
      if (!field?.choices) {
        ctx.addIssue({ code: 'custom', path: ['versions', index, 'when', key], message: `when key "${key}" must name a choice field` })
      } else if (!field.choices.includes(value)) {
        ctx.addIssue({ code: 'custom', path: ['versions', index, 'when', key], message: `when value "${value}" must be one of the choices for "${key}"` })
      }
    }
    const conditions = Object.entries(version.when ?? {}).sort(([left], [right]) => left.localeCompare(right))
    const signature = JSON.stringify([version.lang.toLowerCase(), conditions])
    const previous = seen.get(signature)
    if (previous !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['versions', index], message: `version duplicates version ${previous + 1} for the same lang and when values` })
    } else seen.set(signature, index)
  })
}

const MotifShape = {
  key: SlotKey,
  revision: z.string().min(1),
  label: z.string().min(1),
  fields: z.array(MotifField),
  versions: z.array(MotifVersion).min(1),
  fonts: z.array(FontReference).default([]),
} as const

const MotifInputShape = {
  ...MotifShape,
  fields: z.array(MotifFieldInput),
  versions: z.array(MotifVersionInput).min(1),
  fonts: z.array(FontReferenceInput).default([]),
} as const

export const Motif = z.object(MotifShape).superRefine(validateMotif)
export type Motif = z.infer<typeof Motif>
export const MotifInput = z.strictObject(MotifInputShape).superRefine(validateMotif)
export type MotifInput = z.input<typeof MotifInput>

export interface MotifPlacement {
  key: string
  revision: string
  lang: string
  fields: Record<string, string>
}

export interface MotifSource {
  motif(key: string, options: { revision?: string; signal: AbortSignal }): Promise<Motif | undefined>
  data?(placement: MotifPlacement, options: { signal: AbortSignal }): Promise<Record<string, unknown>>
}

export type MotifVersionChoice = { ok: true; version: MotifVersion; index: number } | { ok: false; reason: string }

export function chooseMotifVersion(motif: Motif, values: { lang?: string } & Record<string, string | undefined>): MotifVersionChoice {
  const suppliedLang = values.lang
  const langs = new Map(motif.versions.map((version) => [version.lang.toLowerCase(), version.lang]))
  const lang = suppliedLang ?? (langs.size === 1 ? langs.values().next().value : undefined)
  if (!lang) return { ok: false, reason: 'no language was supplied and the motif has more than one language' }

  const resolved = Object.fromEntries(motif.fields.map((field) => [field.key, values[field.key] ?? field.default]))
  const normalized = lang.toLowerCase()
  const primary = normalized.split('-')[0]
  const matches = motif.versions
    .map((version, index) => ({ version, index }))
    .filter(({ version }) => {
      const versionLang = version.lang.toLowerCase()
      const versionPrimary = versionLang.split('-')[0]
      if (versionLang !== normalized && versionPrimary !== primary) return false
      return Object.entries(version.when ?? {}).every(([key, value]) => resolved[key] === value)
    })
    .map((match) => ({ ...match, exact: match.version.lang.toLowerCase() === normalized, specificity: Object.keys(match.version.when ?? {}).length }))

  if (matches.length === 0) return { ok: false, reason: `no version matches language "${lang}" and the supplied field values` }
  matches.sort((left, right) => Number(right.exact) - Number(left.exact) || right.specificity - left.specificity)
  const best = matches[0] as (typeof matches)[number]
  const tied = matches.filter((match) => match.exact === best.exact && match.specificity === best.specificity)
  if (tied.length > 1) return { ok: false, reason: `versions ${tied.map((match) => match.index + 1).join(', ')} match equally specifically` }
  return { ok: true, version: best.version, index: best.index }
}
