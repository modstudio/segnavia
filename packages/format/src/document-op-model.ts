import { z } from 'zod'
import { DocumentShape, definitionCollections } from './document.ts'
import { DivisionNodeFields, type DocumentNode, PartNodeFields, SectionNodeFields } from './document-nodes.ts'
import { ConditionNode, ContentsNode, NoteSeriesNode, ParentPageNode, TemplateNode, VariableNode } from './document-nodes-book.ts'
import { BoardItemNode, BoardSectionNode, FlowNode, LabelNode, PageNode, PlacedNode, RecordNode, SlideNode } from './document-nodes-common.ts'
import type { DocumentLocation } from './document-op.ts'

type ObjectSchema = z.ZodObject<z.ZodRawShape>
export type DocumentNodeType = DocumentNode['type'] | 'parentPage' | 'template' | 'noteSeries' | 'variable' | 'condition'
export type OperationNode = Record<string, unknown> & { id: string; type: string; children?: OperationNode[] }
export type OperationDocument = Record<string, unknown> & { id: string; kind: string; children: OperationNode[]; style?: Record<string, unknown> }

export interface DocumentEntry {
  node: OperationNode
  parent: DocumentLocation
  index: number
  depth: number
}

interface NodeModel {
  fields: ReadonlySet<string>
  content: ReadonlySet<string>
  settable: ReadonlySet<string>
  children: boolean
  collection?: (typeof definitionCollections)[number]
}

const schemaFields = (schema: ObjectSchema): string[] => schema.keyof().options
const model = (schema: ObjectSchema, content: readonly string[] = [], collection?: NodeModel['collection']): NodeModel => {
  const fields = new Set(schemaFields(schema))
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

export const DOCUMENT_NODE_MODEL: Readonly<Record<DocumentNodeType, NodeModel>> = {
  division: model(z.object(DivisionNodeFields)),
  part: model(z.object(PartNodeFields), ['html']),
  section: model(z.object(SectionNodeFields)),
  flow: model(FlowNode, ['html']),
  page: model(PageNode, ['body', 'regions']),
  slide: model(SlideNode, ['content', 'notes']),
  placed: model(PlacedNode),
  contents: model(ContentsNode),
  record: model(RecordNode),
  item: model(BoardItemNode),
  label: model(LabelNode),
  boardSection: model(BoardSectionNode),
  parentPage: model(ParentPageNode, ['head', 'foot', 'regions'], 'parentPages'),
  template: model(TemplateNode, ['html'], 'templates'),
  noteSeries: model(NoteSeriesNode, [], 'noteSeries'),
  variable: model(VariableNode, [], 'variables'),
  condition: model(ConditionNode, [], 'conditions'),
}

const ROOT_RESERVED = new Set(['id', 'type', 'kind', 'children', 'style', ...definitionCollections])
export const DOCUMENT_ROOT_FIELDS = new Set(schemaFields(DocumentShape).filter((field) => !ROOT_RESERVED.has(field)))
export const DOCUMENT_STYLE_FIELDS = new Set(schemaFields(DocumentShape.shape.style.unwrap()))

export function nodeModel(type: string): NodeModel | undefined {
  return DOCUMENT_NODE_MODEL[type as DocumentNodeType]
}

export function documentEntries(document: OperationDocument): DocumentEntry[] {
  const result: DocumentEntry[] = []
  const visit = (nodes: OperationNode[], parent: DocumentLocation, depth: number): void => {
    nodes.forEach((node, index) => {
      result.push({ node, parent, index, depth })
      if (nodeModel(node.type)?.children && Array.isArray(node.children)) visit(node.children, { kind: 'node', id: node.id }, depth + 1)
    })
  }
  visit(document.children, { kind: 'node', id: document.id }, 0)
  for (const name of definitionCollections) {
    const nodes = document[name] as OperationNode[]
    nodes.forEach((node, index) => {
      result.push({ node, parent: { kind: 'collection', name }, index, depth: 0 })
    })
  }
  return result
}

export function findDocumentNode(document: OperationDocument, id: string): DocumentEntry | undefined {
  return documentEntries(document).find(({ node }) => node.id === id)
}

export function documentContainer(document: OperationDocument, location: DocumentLocation, refuse: (reason: string) => never): OperationNode[] {
  if (location.kind === 'collection') return document[location.name] as OperationNode[]
  if (location.id === document.id) return document.children
  const parent = findDocumentNode(document, location.id)?.node
  if (!parent) return refuse(`parent node "${location.id}" is missing`)
  if (!nodeModel(parent.type)?.children || !Array.isArray(parent.children)) return refuse(`parent node "${location.id}" cannot hold child nodes`)
  return parent.children
}
