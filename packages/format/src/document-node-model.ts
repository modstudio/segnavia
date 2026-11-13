import { z } from 'zod'
import { DivisionNodeFields, type DocumentNode, PartNodeFields, RecordNodeSchema, SectionNodeFields } from './document-nodes.ts'
import { ConditionNode, ContentsNode, HeadTemplateNode, NoteSeriesNode, ParentPageNode, TemplateNode } from './document-nodes-book.ts'
import { BoardItemNode, BoardSectionNode, FlowNode, LabelNode, PageNode, PlacedNode, SlideNode } from './document-nodes-common.ts'
import { ContentTextVariable, NumberVariable, PartTitleTextVariable, RecordVariable, SectionTitleTextVariable } from './variable.ts'

type ObjectSchema = z.ZodObject<z.ZodRawShape>
export type DocumentNodeType = DocumentNode['type'] | 'parentPage' | 'template' | 'noteSeries' | 'variable' | 'headTemplate' | 'condition'

export interface NodeModel {
  fields: ReadonlySet<string>
  content: ReadonlySet<string>
  settable: ReadonlySet<string>
  children: boolean
  collection?: 'parentPages' | 'templates' | 'noteSeries' | 'variables' | 'headTemplates' | 'conditions'
}

const schemaFields = (schema: ObjectSchema): string[] => schema.keyof().options
const modelFields = (fields: ReadonlySet<string>, content: readonly string[] = [], collection?: NodeModel['collection']): NodeModel => {
  for (const field of content) if (!fields.has(field)) throw new Error(`document op model field ${field} is absent from its node schema`)
  const contentFields = new Set(content)
  return {
    fields,
    content: contentFields,
    settable: new Set([...fields].filter((field) => !['type', 'id', 'children'].includes(field) && !contentFields.has(field))),
    children: fields.has('children'),
    ...(collection ? { collection } : {}),
  }
}
const model = (schema: ObjectSchema, content: readonly string[] = [], collection?: NodeModel['collection']): NodeModel =>
  modelFields(new Set(schemaFields(schema)), content, collection)

const boardSectionModel = (): NodeModel => {
  const result = model(BoardSectionNode)
  return { ...result, settable: new Set([...result.settable].filter((field) => field !== 'items' && field !== 'cells')) }
}

const variableModel = (): NodeModel => {
  const fields = new Set([
    ...schemaFields(ContentTextVariable),
    ...schemaFields(SectionTitleTextVariable),
    ...schemaFields(PartTitleTextVariable),
    ...schemaFields(NumberVariable),
    ...schemaFields(RecordVariable),
    'type',
    'id',
  ])
  return modelFields(fields, [], 'variables')
}

export const DOCUMENT_NODE_MODEL: Readonly<Record<DocumentNodeType, NodeModel>> = {
  division: model(z.object(DivisionNodeFields)),
  part: model(z.object(PartNodeFields), ['html']),
  section: model(z.object(SectionNodeFields)),
  flow: model(FlowNode, ['html']),
  page: model(PageNode, ['body', 'regions']),
  slide: model(SlideNode, ['content', 'notes']),
  placed: model(PlacedNode),
  contents: model(ContentsNode),
  record: model(RecordNodeSchema),
  item: model(BoardItemNode),
  label: model(LabelNode),
  boardSection: boardSectionModel(),
  parentPage: model(ParentPageNode, ['regions'], 'parentPages'),
  template: model(TemplateNode, ['html'], 'templates'),
  noteSeries: model(NoteSeriesNode, [], 'noteSeries'),
  variable: variableModel(),
  headTemplate: model(HeadTemplateNode, [], 'headTemplates'),
  condition: model(ConditionNode, [], 'conditions'),
}

export function nodeModel(type: string): NodeModel | undefined {
  return DOCUMENT_NODE_MODEL[type as DocumentNodeType]
}
