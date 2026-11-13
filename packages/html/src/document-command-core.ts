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
  type OperationNode,
} from '@segnavia/format'
import { CONTENT_FIELD_SHAPES, contentFieldFlows, contentFieldShape, type FragmentShape } from './block-fragments.ts'
import { type BlockIdLocation, identifyHtmlBlocks, lineNumbersState } from './block-identify.ts'
import { blockView } from './block-view.ts'
import { pageBodyFromHtml, pageBodyHtml } from './document.ts'
import { DocumentCommandRefusal, resolveLocation, resolveNode } from './document-addresses.ts'
import type { CommandContentAddress, DocumentCommand, DocumentCommandLocation } from './document-commands.ts'
import type { AlertLabels } from './markdown.ts'

export interface EditDocumentOptions {
  newId?: () => string
  alertLabels?: Partial<AlertLabels>
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

function blockLocations(document: Document, omitted?: { node: string; field: string; key?: string }): Map<string, BlockIdLocation> {
  return new Map(
    blockView(document)
      .filter(({ address }) => !omitted || address.node !== omitted.node || address.field !== omitted.field || address.key !== omitted.key)
      .map(({ id, kind, address }) => {
        const key = address.key === undefined ? '' : ` key "${address.key}"`
        return [id, { block: `<${kind}>`, node: `node "${address.node}" field "${address.field}"${key}` }]
      }),
  )
}

function pageBodySource(value: object, context: DocumentCommandContext): { source: string; markdown?: string } | undefined {
  const body = value as { html?: unknown; markdown?: unknown }
  const markdown = typeof body.markdown === 'string' ? body.markdown : undefined
  if (typeof body.html === 'string') return { source: body.html, markdown }
  if (markdown === undefined) return undefined
  return { source: pageBodyHtml({ markdown }, context.document, { alertLabels: context.options.alertLabels }), markdown }
}

function identifiedField(
  value: unknown,
  shape: FragmentShape,
  context: DocumentCommandContext,
  usedBlocks: Map<string, BlockIdLocation>,
  added: string[],
  nodeType: string,
  nodeLabel: string,
): unknown {
  const identify = (html: string, options: { insideNamedRegion?: string; parentRegion?: boolean; flowing?: boolean } = {}): string => {
    const result = identifyHtmlBlocks(html, nodeLabel, context.options.newId ?? defaultNewId, usedBlocks, {
      ...options,
      lineNumbers: lineNumbersState(context.document),
    })
    added.push(...result.added)
    return result.html
  }
  const flowing = contentFieldFlows(context.document.kind, nodeType as keyof typeof CONTENT_FIELD_SHAPES, shape)
  if (shape === 'htmlString' && typeof value === 'string') return identify(value, { flowing })
  if (!value || typeof value !== 'object') return value
  if (shape === 'pageBody') {
    const body = pageBodySource(value, context)
    return body === undefined ? value : pageBodyFromHtml(identify(body.source, { flowing }), body.markdown)
  }
  if (shape === 'slideContent') {
    const held = value as { kind?: unknown; html?: unknown }
    return held.kind === 'html' && typeof held.html === 'string' ? { ...value, html: identify(held.html, { flowing }) } : value
  }
  if (shape === 'record')
    return Object.fromEntries(
      Object.entries(value).map(([key, html]) => [key, typeof html === 'string' ? identify(html, { insideNamedRegion: key, flowing }) : html]),
    )
  if (shape === 'regionRecord') {
    return Object.fromEntries(
      Object.entries(value).map(([key, region]) => {
        if (!region || typeof region !== 'object') return [key, region]
        const held = region as Record<string, unknown>
        return [key, typeof held.html === 'string' ? { ...held, html: identify(held.html, { insideNamedRegion: key, parentRegion: true }) } : held]
      }),
    )
  }
  return value
}

function identifyContent(node: Record<string, unknown>, context: DocumentCommandContext, usedBlocks: Map<string, BlockIdLocation>, added: string[]): void {
  const shapes = CONTENT_FIELD_SHAPES[node.type as keyof typeof CONTENT_FIELD_SHAPES] ?? {}
  const label = `${String(node.type)} node "${String(node.id)}"`
  for (const [field, shape] of Object.entries(shapes)) node[field] = identifiedField(node[field], shape, context, usedBlocks, added, String(node.type), label)
}

export function identifyAddedNode(context: DocumentCommandContext, input: Record<string, unknown>): { node: OperationNode; added: string[] } {
  const nodeIds = new Set(documentEntries(context.document as unknown as OperationDocument).map(({ node }) => node.id))
  const blocks = blockLocations(context.document)
  const added: string[] = []
  const visit = (value: Record<string, unknown>): OperationNode => {
    const id = uniqueId(context, value.id, nodeIds, `${String(value.type ?? 'new')} node`)
    added.push(id)
    const node: Record<string, unknown> = { ...value, id }
    identifyContent(node, context, blocks, added)
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

export function htmlWithIds(
  context: DocumentCommandContext,
  html: string,
  replacing?: { node: string; field: string; key?: string },
): { html: string; added: string[] } {
  const used = blockLocations(context.document, replacing)
  const node = replacing ? resolveNode(context.document, { id: replacing.node }).node : undefined
  const shape = node && replacing ? contentFieldShape(node.type as keyof typeof CONTENT_FIELD_SHAPES, replacing.field) : undefined
  const region = replacing?.key
  return identifyHtmlBlocks(html, node ? `${node.type} node "${node.id}"` : 'supplied content', context.options.newId ?? defaultNewId, used, {
    ...(region && (shape === 'record' || shape === 'regionRecord') ? { insideNamedRegion: region } : {}),
    ...(shape === 'regionRecord' ? { parentRegion: true } : {}),
    flowing: node && shape ? contentFieldFlows(context.document.kind, node.type as keyof typeof CONTENT_FIELD_SHAPES, shape) : false,
    lineNumbers: lineNumbersState(context.document),
  })
}

export function identifiedContentValue(
  context: DocumentCommandContext,
  address: ReturnType<typeof contentAddress>,
  value: unknown,
): { value: unknown; added: string[] } {
  const added: string[] = []
  const shape = contentFieldShape(address.node.type as keyof typeof CONTENT_FIELD_SHAPES, address.field)
  const held = identifiedField(
    value,
    shape,
    context,
    blockLocations(context.document, { node: address.node.id, field: address.field, ...(address.key === undefined ? {} : { key: address.key }) }),
    added,
    address.node.type,
    `${address.node.type} node "${address.node.id}"`,
  )
  return { value: held, added }
}
