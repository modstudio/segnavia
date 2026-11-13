import { z } from 'zod'
import { BookOpens, BookTemplate, ContentsLabel, Subtitle } from './book-section.ts'
import { closedObject } from './closed-object.ts'
import { Direction } from './direction.ts'
import { NodeId } from './document-nodes-common.ts'
import { SectionNumbering } from './folio.ts'
import { HeadTemplate } from './head-template.ts'
import { RequiredLogicalMargin } from './margins.ts'
import { NoteSeries } from './note-series.ts'
import { RemovedParentPageFields } from './parent-page-fields.ts'
import { ParentRegions } from './parent-regions.ts'
import { parentRules } from './parent-rules.ts'
import { ContentTextVariable, MetaVariable, NumberVariable, PartTitleTextVariable, RecordVariable, SectionTitleTextVariable } from './variable.ts'

export const HeadTemplateNode = HeadTemplate.extend({ type: z.literal('headTemplate'), id: z.string().optional() })

export const SectionFields = {
  title: z.string().optional(),
  contentsLabel: ContentsLabel.optional(),
  subtitle: Subtitle.optional(),
  contents: z.boolean().optional(),
  opens: BookOpens.optional(),
  numbering: SectionNumbering.optional(),
  parentRules: parentRules.optional(),
  parents: z.unknown().optional(),
  pageGeometry: z.string().optional(),
  lang: z.string().optional(),
  dir: Direction.optional(),
}

export const ContentsNode = NodeId.extend({
  type: z.literal('contents'),
  title: z.string().optional(),
  depth: z.number().int().min(1).max(6).optional(),
  pageNumbers: z.boolean().optional(),
  opens: BookOpens.optional(),
  parentRules: parentRules.optional(),
  parents: z.unknown().optional(),
  numbering: SectionNumbering.optional(),
})

export const ParentPageNode = NodeId.extend({
  ...RemovedParentPageFields,
  type: z.literal('parentPage'),
  name: z.string().min(1),
  basedOn: z.string().min(1).optional(),
  geometry: closedObject({ margin: RequiredLogicalMargin.optional() }).default({}),
  regions: ParentRegions.default({}),
})
export const TemplateNode = BookTemplate.extend({ type: z.literal('template'), id: z.string().optional() })
export const NoteSeriesNode = NoteSeries.extend({ type: z.literal('noteSeries'), id: z.string().optional() })

const VariableNodeFields = { type: z.literal('variable'), id: z.string().optional() }

const TextVariableNode = z.discriminatedUnion('from', [
  ContentTextVariable.extend(VariableNodeFields),
  SectionTitleTextVariable.extend(VariableNodeFields),
  PartTitleTextVariable.extend(VariableNodeFields),
])

export const VariableNode = z.discriminatedUnion('kind', [
  TextVariableNode,
  NumberVariable.extend(VariableNodeFields),
  RecordVariable.extend(VariableNodeFields),
  MetaVariable.extend(VariableNodeFields),
])

export const ConditionNode = NodeId.extend({ type: z.literal('condition'), name: z.string() })

export const DocumentDefinitionNode = z.union([ParentPageNode, TemplateNode, NoteSeriesNode, VariableNode, HeadTemplateNode, ConditionNode])

export type ContentsNode = z.infer<typeof ContentsNode>
export type ParentPageNode = z.infer<typeof ParentPageNode>
export type TemplateNode = z.infer<typeof TemplateNode>
export type NoteSeriesNode = z.infer<typeof NoteSeriesNode>
export type VariableNode = z.infer<typeof VariableNode>
export type HeadTemplateNode = z.infer<typeof HeadTemplateNode>
export type ConditionNode = z.infer<typeof ConditionNode>
export type DocumentDefinitionNode = z.infer<typeof DocumentDefinitionNode>
