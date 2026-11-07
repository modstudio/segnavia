import { DOCUMENT_NODE_MODEL, type Document, type DocumentLocation, documentEntries, type OperationDocument } from '@segnavia/format'
import type { DocumentAddress, DocumentCommandLocation } from './document-commands.ts'

type OperationNode = Record<string, unknown> & { id: string; type: string; children?: OperationNode[] }

export class DocumentCommandRefusal extends Error {
  constructor(
    message: string,
    readonly clearing: string,
  ) {
    super(message)
  }
}

export interface ResolvedNode {
  node: OperationNode
  parent: DocumentLocation
  index: number
}

export function resolveNode(document: Document, address: DocumentAddress): ResolvedNode {
  if ('id' in address && address.id === document.id) {
    return { node: document as unknown as OperationNode, parent: { kind: 'node', id: document.id }, index: 0 }
  }
  const entries = documentEntries(document as unknown as OperationDocument)
  if ('id' in address) {
    const entry = entries.find(({ node }) => node.id === address.id)
    if (!entry) throw new DocumentCommandRefusal(`node id "${address.id}" is unknown`, 'use the id or unique name of an existing node')
    return entry
  }
  const matches = entries.filter(
    ({ node }) => DOCUMENT_NODE_MODEL[node.type as keyof typeof DOCUMENT_NODE_MODEL]?.fields.has('name') && node.name === address.name,
  )
  if (matches.length === 0) throw new DocumentCommandRefusal(`node name "${address.name}" is unknown`, 'use the id or unique name of an existing node')
  if (matches.length > 1) {
    throw new DocumentCommandRefusal(
      `node name "${address.name}" is ambiguous (held by ids ${matches.map(({ node }) => `"${node.id}"`).join(', ')})`,
      'address the node by id',
    )
  }
  return matches[0] as ResolvedNode
}

export function resolveLocation(document: Document, location: DocumentCommandLocation): { parent: DocumentLocation; index: number } {
  if ('collection' in location) {
    const nodes = (document as unknown as Record<string, unknown[]>)[location.collection] ?? []
    return { parent: { kind: 'collection', name: location.collection }, index: nodes.length }
  }
  if ('parent' in location) {
    const parent = 'id' in location.parent && location.parent.id === document.id ? undefined : resolveNode(document, location.parent)
    const node = parent?.node
    if (node && (!DOCUMENT_NODE_MODEL[node.type as keyof typeof DOCUMENT_NODE_MODEL]?.children || !Array.isArray(node.children))) {
      throw new DocumentCommandRefusal(`node "${node.id}" cannot hold child nodes`, 'choose a parent whose model has children')
    }
    const length = parent ? (node?.children?.length ?? 0) : document.children.length
    if (location.index > length) throw new DocumentCommandRefusal(`index ${location.index} is outside 0..${length}`, 'use an index in the parent')
    return { parent: { kind: 'node', id: parent?.node.id ?? document.id }, index: location.index }
  }
  const sibling = resolveNode(document, 'before' in location ? location.before : location.after)
  return { parent: sibling.parent, index: sibling.index + ('after' in location ? 1 : 0) }
}
