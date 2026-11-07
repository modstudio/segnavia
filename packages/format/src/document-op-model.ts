import type { z } from 'zod'
import { DocumentShape, definitionCollections } from './document.ts'
import { DivisionNodeFields, type DocumentNode, PartNodeFields, SectionNodeFields } from './document-nodes.ts'
import { ConditionNode, ContentsNode, NoteSeriesNode, ParentPageNode, TemplateNode, VariableNode } from './document-nodes-book.ts'
import { BoardItemNode, BoardSectionNode, FlowNode, LabelNode, PageNode, PlacedNode, RecordNode, SlideNode } from './document-nodes-common.ts'

type ObjectSchema = z.ZodObject<z.ZodRawShape>
type NodeType = DocumentNode['type'] | 'parentPage' | 'template' | 'noteSeries' | 'variable' | 'condition'

interface NodeModel {
  fields: ReadonlySet<string>
  content: ReadonlySet<string>
  children: boolean
  collection?: (typeof definitionCollections)[number]
}

const schemaFields = (schema: ObjectSchema): string[] => schema.keyof().options
const model = (
  schema: ObjectSchema,
  content: readonly string[] = [],
  options: { children?: boolean; collection?: NodeModel['collection'] } = {},
): NodeModel => {
  const fields = new Set(schemaFields(schema))
  for (const field of content) if (!fields.has(field)) throw new Error(`document op model field ${field} is absent from its node schema`)
  return { fields, content: new Set(content), children: options.children ?? false, collection: options.collection }
}

export const DOCUMENT_NODE_MODEL: Readonly<Record<NodeType, NodeModel>> = {
  division: { fields: new Set(Object.keys(DivisionNodeFields)), content: new Set(), children: true },
  part: {
    fields: new Set(Object.keys(PartNodeFields)),
    content: new Set(['html']),
    children: true,
  },
  section: {
    fields: new Set(Object.keys(SectionNodeFields)),
    content: new Set(),
    children: true,
  },
  flow: model(FlowNode, ['html']),
  page: model(PageNode, ['body', 'regions']),
  slide: model(SlideNode, ['content', 'notes']),
  placed: model(PlacedNode),
  contents: model(ContentsNode),
  record: model(RecordNode),
  item: model(BoardItemNode),
  label: model(LabelNode),
  boardSection: model(BoardSectionNode),
  parentPage: model(ParentPageNode, ['head', 'foot', 'regions'], { collection: 'parentPages' }),
  template: model(TemplateNode, ['html'], { collection: 'templates' }),
  noteSeries: model(NoteSeriesNode, [], { collection: 'noteSeries' }),
  variable: model(VariableNode, [], { collection: 'variables' }),
  condition: model(ConditionNode, [], { collection: 'conditions' }),
}

const ROOT_RESERVED = new Set(['id', 'type', 'children', 'style', ...definitionCollections])
export const DOCUMENT_ROOT_FIELDS = new Set(schemaFields(DocumentShape).filter((field) => !ROOT_RESERVED.has(field)))
export const DOCUMENT_STYLE_FIELDS = new Set(schemaFields(DocumentShape.shape.style.unwrap()))

export function nodeModel(type: string): NodeModel | undefined {
  return DOCUMENT_NODE_MODEL[type as NodeType]
}
