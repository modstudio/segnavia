import { z } from 'zod'
import { BookRunningHeadSource } from './book.ts'
import { BookOpens, BookSectionParents, BookTemplate, ContentsLabel, Subtitle } from './book-section.ts'
import { NodeId } from './document-nodes-common.ts'
import { Numbering } from './folio.ts'
import { RequiredLogicalMargin } from './margins.ts'
import { NoteSeries } from './note-series.ts'

export const SectionFields = {
  title: z.string().optional(),
  contentsLabel: ContentsLabel.optional(),
  subtitle: Subtitle.optional(),
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

export const ParentPageNode = NodeId.extend({
  type: z.literal('parentPage'),
  name: z.string().min(1),
  basedOn: z.string().min(1).optional(),
  geometry: z.object({ margin: RequiredLogicalMargin.optional() }).default({}),
  head: z.string().optional(),
  foot: z.string().optional(),
  regions: z.record(z.string(), z.string()).optional(),
})
export const TemplateNode = BookTemplate.extend({ type: z.literal('template'), id: z.string().optional() })
export const NoteSeriesNode = NoteSeries.extend({ type: z.literal('noteSeries'), id: z.string().optional() })

export const VariableNode = NodeId.extend({
  type: z.literal('variable'),
  name: z.string().min(1),
  valueType: z.enum(['text', 'folio', 'pages', 'date', 'meta']),
  from: BookRunningHeadSource.optional(),
})

export const ConditionNode = NodeId.extend({ type: z.literal('condition'), name: z.string() })

export const DocumentDefinitionNode = z.union([ParentPageNode, TemplateNode, NoteSeriesNode, VariableNode, ConditionNode])

export type ContentsNode = z.infer<typeof ContentsNode>
export type ParentPageNode = z.infer<typeof ParentPageNode>
export type TemplateNode = z.infer<typeof TemplateNode>
export type NoteSeriesNode = z.infer<typeof NoteSeriesNode>
export type VariableNode = z.infer<typeof VariableNode>
export type ConditionNode = z.infer<typeof ConditionNode>
export type DocumentDefinitionNode = z.infer<typeof DocumentDefinitionNode>
