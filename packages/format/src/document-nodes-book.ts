import { z } from 'zod'
import { BookRunningHeadSource } from './book.ts'
import { BookOpens, BookSectionParents, BookTemplate } from './book-section.ts'
import { NodeId } from './document-nodes-common.ts'
import { Numbering } from './folio.ts'
import { NoteSeries } from './note-series.ts'
import { ParentPage } from './printed-pages.ts'

export const SectionFields = {
  title: z.string().optional(),
  contents: z.boolean().default(true),
  opens: z.union([BookOpens, z.literal('continue')]).optional(),
  numbering: Numbering.optional(),
  parents: BookSectionParents.optional(),
  headTemplate: z.string().optional(),
  pageGeometry: z.string().optional(),
}

export const ContentsNode = NodeId.extend({
  type: z.literal('contents'),
  title: z.string().optional(),
  depth: z.number().int().min(1).max(6).optional(),
  pageNumbers: z.boolean().optional(),
  opens: BookOpens.optional(),
  parents: BookSectionParents.optional(),
})

export const ParentPageNode = ParentPage.extend({ type: z.literal('parentPage'), id: z.string().optional() })
export const TemplateNode = BookTemplate.extend({ type: z.literal('template'), id: z.string().optional() })
export const NoteSeriesNode = NoteSeries.extend({ type: z.literal('noteSeries'), id: z.string().optional() })

export const VariableNode = NodeId.extend({
  type: z.literal('variable'),
  name: z.string().min(1),
  valueType: z.enum(['text', 'folio', 'pages', 'date', 'meta']),
  from: BookRunningHeadSource.optional(),
})

export const ConditionNode = NodeId.extend({ type: z.literal('condition'), name: z.string() })

export type ContentsNode = z.infer<typeof ContentsNode>
export type ParentPageNode = z.infer<typeof ParentPageNode>
export type TemplateNode = z.infer<typeof TemplateNode>
export type NoteSeriesNode = z.infer<typeof NoteSeriesNode>
export type VariableNode = z.infer<typeof VariableNode>
export type ConditionNode = z.infer<typeof ConditionNode>
