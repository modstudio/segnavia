import { z } from 'zod'
import { BookOpens } from './book-section.ts'
import { TextDirection } from './direction.ts'
import { SectionNumbering } from './folio.ts'
import { parentRules } from './parent-rules.ts'
import { RecordFacts } from './record-facts.ts'
import { Variable } from './variable.ts'

export const PaginateLine = z.object({ top: z.number(), bottom: z.number() })
export type PaginateLine = z.infer<typeof PaginateLine>

export const PaginateNoteRef = z.object({ note: z.string(), line: z.number() })
export type PaginateNoteRef = z.infer<typeof PaginateNoteRef>

export const PaginateVariable = z.object({ name: z.string(), value: z.string(), line: z.number(), scope: z.literal('flow').optional() })
export type PaginateVariable = z.infer<typeof PaginateVariable>

export const PaginateBlock = z.object({
  kind: z.enum(['heading', 'figure', 'table', 'text']),
  tag: z.string(),
  position: z.object({ chapter: z.number(), block: z.number() }),
  lines: z.array(PaginateLine),
  id: z.string().optional(),
  breakBefore: z.boolean().optional(),
  breakAfter: z.boolean().optional(),
  columns: z.number().optional(),
  orphans: z.number().optional(),
  widows: z.number().optional(),
  keepWithNext: z.boolean().optional(),
  keepWithNextFrom: z.number().int().nonnegative().optional(),
  keepTogether: z.boolean().optional(),
  keepRuns: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() })).optional(),
  headerHeight: z.number().optional(),
  footnoteRefs: z.array(PaginateNoteRef).optional(),
  variables: z.array(PaginateVariable).optional(),
})
export type PaginateBlock = z.infer<typeof PaginateBlock>

const PaginateFlowBase = {
  id: z.string(),
  sequence: z.enum(['front', 'body']).optional(),
  opens: BookOpens.optional(),
  parentRules: parentRules.optional(),
  numbering: SectionNumbering.optional(),
  record: RecordFacts.optional(),
  pageGeometry: z.string().optional(),
}

export const PaginateFlow = z.discriminatedUnion('kind', [
  z.object({ ...PaginateFlowBase, kind: z.literal('front'), blocks: z.array(PaginateBlock) }),
  z.object({ ...PaginateFlowBase, kind: z.literal('contents'), blocks: z.array(PaginateBlock) }),
  z.object({ ...PaginateFlowBase, kind: z.literal('part'), blocks: z.array(PaginateBlock) }),
  z.object({ ...PaginateFlowBase, kind: z.literal('chapter'), blocks: z.array(PaginateBlock) }),
  z.object({ ...PaginateFlowBase, kind: z.literal('endnotes'), blocks: z.array(PaginateBlock) }),
  z.object({
    ...PaginateFlowBase,
    kind: z.literal('fixed'),
    pages: z.number(),
    role: z.enum(['fixed', 'body']).optional(),
    pageParentRules: z.array(parentRules).optional(),
  }),
])
export type PaginateFlow = z.infer<typeof PaginateFlow>

export const PaginateNote = z.object({ id: z.string(), series: z.string(), lines: z.array(PaginateLine) })
export type PaginateNote = z.infer<typeof PaginateNote>

export const PaginateNoteSeriesGeometry = z.object({ name: z.string(), gap: z.number() })
export type PaginateNoteSeriesGeometry = z.infer<typeof PaginateNoteSeriesGeometry>

export const Measurements = z.object({
  variables: z.array(Variable).default([]),
  document: z
    .object({
      lang: z.string().optional(),
      metadata: z.object({ title: z.string().optional(), subject: z.string().optional(), authors: z.array(z.string()).optional(), extra: z.record(z.string(), z.string()).optional() }),
    })
    .default({ metadata: {} }),
  flows: z.array(PaginateFlow),
  notes: z.array(PaginateNote),
  geometry: z.object({ notesGap: z.number(), noteSeries: z.array(PaginateNoteSeriesGeometry).optional() }),
  parents: z.record(z.string(), z.object({ width: z.number(), height: z.number() })),
  geometryParents: z.record(z.string(), z.record(z.string(), z.object({ width: z.number(), height: z.number() }))).optional(),
  pageGeometries: z.record(z.string(), z.object({ width: z.number(), height: z.number() })).optional(),
  settings: z.object({
    orphans: z.number().optional(),
    widows: z.number().optional(),
    rectoOpenings: z.boolean(),
    direction: TextDirection,
    endnotePlacement: z.enum(['chapter', 'book']),
  }),
})
export type Measurements = z.infer<typeof Measurements>
