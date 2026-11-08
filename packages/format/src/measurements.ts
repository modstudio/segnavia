import { z } from 'zod'
import { BookOpens, BookSectionParents } from './book-section.ts'
import { TextDirection } from './direction.ts'
import { BOOK_PARENT_NAMES } from './printed-pages.ts'

export const PaginateLine = z.object({ top: z.number(), bottom: z.number() })
export type PaginateLine = z.infer<typeof PaginateLine>

export const PaginateNoteRef = z.object({ note: z.string(), line: z.number() })
export type PaginateNoteRef = z.infer<typeof PaginateNoteRef>

export const PaginateMark = z.object({ name: z.string(), value: z.string(), line: z.number() })
export type PaginateMark = z.infer<typeof PaginateMark>

export const PaginateBlock = z.object({
  kind: z.enum(['heading', 'figure', 'table', 'text']),
  tag: z.string(),
  position: z.object({ chapter: z.number(), block: z.number() }),
  lines: z.array(PaginateLine),
  id: z.string().optional(),
  breakBefore: z.boolean().optional(),
  columns: z.number().optional(),
  orphans: z.number().optional(),
  widows: z.number().optional(),
  keepWithNext: z.boolean().optional(),
  keepTogether: z.boolean().optional(),
  keepRuns: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() })).optional(),
  headerHeight: z.number().optional(),
  footnoteRefs: z.array(PaginateNoteRef).optional(),
  marks: z.array(PaginateMark).optional(),
})
export type PaginateBlock = z.infer<typeof PaginateBlock>

const PaginateFlowBase = {
  id: z.string(),
  sequence: z.enum(['front', 'body']).optional(),
  runningHead: z.string().optional(),
  opens: BookOpens.optional(),
  parents: BookSectionParents.optional(),
  parts: z.record(z.string(), z.string()).optional(),
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
    pageParents: z.array(BookSectionParents).optional(),
  }),
])
export type PaginateFlow = z.infer<typeof PaginateFlow>

export const PaginateNote = z.object({ id: z.string(), series: z.string(), lines: z.array(PaginateLine) })
export type PaginateNote = z.infer<typeof PaginateNote>

export const PaginateNoteSeriesGeometry = z.object({ name: z.string(), gap: z.number() })
export type PaginateNoteSeriesGeometry = z.infer<typeof PaginateNoteSeriesGeometry>

export const Measurements = z.object({
  flows: z.array(PaginateFlow),
  notes: z.array(PaginateNote),
  geometry: z.object({ notesGap: z.number(), noteSeries: z.array(PaginateNoteSeriesGeometry).optional() }),
  parents: z.record(z.string(), z.object({ width: z.number(), height: z.number() })),
  parentNames: z.object({
    recto: z.literal(BOOK_PARENT_NAMES.recto),
    verso: z.literal(BOOK_PARENT_NAMES.verso),
    opener: z.literal(BOOK_PARENT_NAMES.opener),
    blank: z.literal(BOOK_PARENT_NAMES.blank),
  }),
  settings: z.object({
    orphans: z.number().optional(),
    widows: z.number().optional(),
    rectoOpenings: z.boolean(),
    direction: TextDirection,
    endnotePlacement: z.enum(['chapter', 'book']),
  }),
})
export type Measurements = z.infer<typeof Measurements>
