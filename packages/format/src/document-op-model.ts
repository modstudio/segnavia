import { DocumentShape, definitionCollections } from './document.ts'
import { nodeModel } from './document-node-model.ts'
import type { DocumentLocation } from './document-op.ts'

export { DOCUMENT_NODE_MODEL, type DocumentNodeType, nodeModel } from './document-node-model.ts'

export type OperationNode = Record<string, unknown> & { id: string; type: string; children?: OperationNode[] }
export type OperationDocument = Record<string, unknown> & { id: string; kind: string; children: OperationNode[]; style?: Record<string, unknown> }

export interface DocumentEntry {
  node: OperationNode
  parent: DocumentLocation
  index: number
  depth: number
}

const schemaFields = (schema: { keyof: () => { options: string[] } }): string[] => schema.keyof().options
const ROOT_RESERVED = new Set(['id', 'type', 'kind', 'children', 'style', ...definitionCollections])
export const DOCUMENT_ROOT_FIELDS = new Set(schemaFields(DocumentShape).filter((field) => !ROOT_RESERVED.has(field)))
export const DOCUMENT_STYLE_FIELDS = new Set(schemaFields(DocumentShape.shape.style.unwrap()))

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
