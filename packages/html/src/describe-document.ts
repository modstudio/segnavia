import { DOCUMENT_NODE_MODEL, type Document, type DocumentLocation, type OperationDocument, resolveLimits } from '@segnavia/format'
import { type BlockViewEntry, blockView } from './block-view.ts'

type OperationNode = Record<string, unknown> & { id: string; type: string; children?: OperationNode[] }

export interface DescribeDocumentOptions {
  detail?: 'concise' | 'full'
}

export interface DocumentDescriptionNode {
  id: string
  type: string
  name?: string
  fields: Record<string, unknown>
  location: { parent?: string; collection?: string; index: number }
  children: DocumentDescriptionNode[]
}

export interface DocumentDescription {
  structure: DocumentDescriptionNode[]
  definitions: Record<string, DocumentDescriptionNode[]>
  blocks: BlockViewEntry[]
  styles: {
    document: Record<string, unknown>
    nodes: []
    inheritance: 'none'
  }
}

function locationValue(parent: DocumentLocation, index: number): DocumentDescriptionNode['location'] {
  return parent.kind === 'collection' ? { collection: parent.name, index } : { parent: parent.id, index }
}

function describeNode(node: OperationNode, parent: DocumentLocation, index: number): DocumentDescriptionNode {
  const model = DOCUMENT_NODE_MODEL[node.type as keyof typeof DOCUMENT_NODE_MODEL]
  const fields = Object.fromEntries(
    Object.entries(node).filter(
      ([field, value]) => value !== undefined && !['id', 'type', 'name', 'children', 'style'].includes(field) && !model?.content.has(field),
    ),
  )
  return {
    id: node.id,
    type: node.type,
    ...(model?.fields.has('name') && typeof node.name === 'string' ? { name: node.name } : {}),
    fields,
    location: locationValue(parent, index),
    children: Array.isArray(node.children) ? node.children.map((child, childIndex) => describeNode(child, { kind: 'node', id: node.id }, childIndex)) : [],
  }
}

function conciseBlock(block: BlockViewEntry, limit: number): BlockViewEntry {
  const points = [...block.text]
  if (points.length <= limit) return block
  if (limit === 0) return { ...block, text: '' }
  return { ...block, text: `${points.slice(0, limit - 1).join('')}…` }
}

/**
 * Describes only style state held by the current model: document style keys.
 * Nodes have no style state or inheritance; per-node styles arrive with the StyleSheet.
 */
export function describeDocument(document: Document, options: DescribeDocumentOptions = {}): DocumentDescription {
  const held = document as unknown as OperationDocument
  const structure = held.children.map((node, index) => describeNode(node, { kind: 'node', id: held.id }, index))
  const definitions: Record<string, DocumentDescriptionNode[]> = {}
  for (const [name, nodes] of [
    ['parentPages', held.parentPages],
    ['templates', held.templates],
    ['noteSeries', held.noteSeries],
    ['variables', held.variables],
    ['conditions', held.conditions],
  ] as const) {
    definitions[name] = (nodes as OperationNode[]).map((node, index) => describeNode(node, { kind: 'collection', name }, index))
  }
  const limit = resolveLimits(document.limits, undefined).descriptionTextChars
  const blocks = blockView(document).map((block) => (options.detail === 'full' ? block : conciseBlock(block, limit)))
  return {
    structure,
    definitions,
    blocks,
    styles: { document: { ...(document.style ?? {}) }, nodes: [], inheritance: 'none' },
  }
}
