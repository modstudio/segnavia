import {
  applyOps,
  DOCUMENT_NODE_MODEL,
  type Document,
  type DocumentBatch,
  type DocumentOp,
  defaultNewId,
  documentEntries,
  fingerprintDocument,
  type OperationDocument,
} from '@segnavia/format'
import { CONTENT_FIELD_SHAPES } from './block-fragments.ts'
import { blockElements, blockView } from './block-view.ts'
import { DocumentCommandRefusal, resolveLocation, resolveNode } from './document-addresses.ts'
import type { CommandContentAddress, DocumentCommand, DocumentCommandLocation } from './document-commands.ts'
import { parse, serialize } from './sanitize.ts'

type OperationNode = Record<string, unknown> & { id: string; type: string; children?: OperationNode[] }

export interface EditDocumentOptions {
  newId?: () => string
}

export interface DocumentCommandContext {
  document: Document
  options: EditDocumentOptions
  command: number
}

export interface DocumentCommandResult {
  document: Document
  ops: DocumentOp[]
  added: string[]
}

export type DocumentCommandHandler = (context: DocumentCommandContext, command: DocumentCommand) => DocumentCommandResult

function uniqueId(context: DocumentCommandContext, supplied: unknown, used: Set<string>, subject: string): string {
  const id = typeof supplied === 'string' && supplied.length > 0 ? supplied : (context.options.newId ?? defaultNewId)()
  if (!id) throw new DocumentCommandRefusal(`${subject} has no id`, 'supply an id or return a non-empty id from newId')
  if (used.has(id)) throw new DocumentCommandRefusal(`id "${id}" already exists`, 'supply a unique id')
  used.add(id)
  return id
}

function identifyHtml(html: string, context: DocumentCommandContext, usedBlocks: Set<string>, added: string[]): string {
  const tree = parse(html)
  for (const element of blockElements(tree.children)) {
    const id = uniqueId(context, element.attribs['data-segnavia-id'], usedBlocks, `<${element.name}> block`)
    if (!element.attribs['data-segnavia-id']) added.push(id)
    element.attribs['data-segnavia-id'] = id
  }
  return serialize(tree)
}

function identifyContent(node: Record<string, unknown>, context: DocumentCommandContext, usedBlocks: Set<string>, added: string[]): void {
  const shapes = CONTENT_FIELD_SHAPES[node.type as keyof typeof CONTENT_FIELD_SHAPES] ?? {}
  for (const [field, shape] of Object.entries(shapes)) {
    const value = node[field]
    if (shape === 'htmlString' && typeof value === 'string') node[field] = identifyHtml(value, context, usedBlocks, added)
    else if (shape === 'pageBody' && value && typeof value === 'object' && typeof (value as { html?: unknown }).html === 'string') {
      node[field] = { ...(value as object), html: identifyHtml((value as { html: string }).html, context, usedBlocks, added) }
    } else if (shape === 'slideContent' && value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'html') {
      const held = value as { html?: unknown }
      if (typeof held.html === 'string') node[field] = { ...(value as object), html: identifyHtml(held.html, context, usedBlocks, added) }
    } else if (shape === 'record' && value && typeof value === 'object') {
      node[field] = Object.fromEntries(
        Object.entries(value).map(([key, html]) => [key, typeof html === 'string' ? identifyHtml(html, context, usedBlocks, added) : html]),
      )
    }
  }
}

export function identifyAddedNode(context: DocumentCommandContext, input: Record<string, unknown>): { node: OperationNode; added: string[] } {
  const nodeIds = new Set(documentEntries(context.document as unknown as OperationDocument).map(({ node }) => node.id))
  const blockIds = new Set(blockView(context.document).map(({ id }) => id))
  const added: string[] = []
  const visit = (value: Record<string, unknown>): OperationNode => {
    const id = uniqueId(context, value.id, nodeIds, `${String(value.type ?? 'new')} node`)
    added.push(id)
    const node: Record<string, unknown> = { ...value, id }
    identifyContent(node, context, blockIds, added)
    if (Array.isArray(value.children)) node.children = value.children.map((child) => visit(child as Record<string, unknown>))
    return node as OperationNode
  }
  return { node: visit(input), added }
}

export function applyCommandOps(context: DocumentCommandContext, ops: DocumentOp[], added: string[] = []): DocumentCommandResult {
  const batch: DocumentBatch = { base: fingerprintDocument(context.document), ops }
  return { document: applyOps(context.document, batch), ops, added }
}

export function contentAddress(context: DocumentCommandContext, address: CommandContentAddress): { node: OperationNode; field: string; key?: string } {
  const node = resolveNode(context.document, address.node).node
  const model = DOCUMENT_NODE_MODEL[node.type as keyof typeof DOCUMENT_NODE_MODEL]
  if (!model?.content.has(address.field)) {
    throw new DocumentCommandRefusal(`field "${address.field}" is not content on node type "${node.type}"`, 'use a content field from the document model')
  }
  return { node, field: address.field, ...(address.key === undefined ? {} : { key: address.key }) }
}

export function commandLocation(context: DocumentCommandContext, location: DocumentCommandLocation, moving?: ReturnType<typeof resolveNode>) {
  const target = resolveLocation(context.document, location)
  if (moving && moving.parent.kind === target.parent.kind && JSON.stringify(moving.parent) === JSON.stringify(target.parent) && moving.index < target.index) {
    return { ...target, index: target.index - 1 }
  }
  return target
}

export function addedBlocks(before: Document, after: Document): string[] {
  const existing = new Set(blockView(before).map(({ id }) => id))
  return blockView(after)
    .map(({ id }) => id)
    .filter((id) => !existing.has(id))
}

export function htmlWithIds(context: DocumentCommandContext, html: string): { html: string; added: string[] } {
  const used = new Set(blockView(context.document).map(({ id }) => id))
  const added: string[] = []
  return { html: identifyHtml(html, context, used, added), added }
}
