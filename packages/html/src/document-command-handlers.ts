import type { DocumentOp } from '@segnavia/format'
import type { ContentAddress } from './block-fragments.ts'
import { type BlockPosition, insertBlock, moveBlock, removeBlock, type SetBlockChange, setBlock } from './block-ops.ts'
import { DocumentCommandRefusal, resolveNode } from './document-addresses.ts'
import {
  addedBlocks,
  applyCommandOps,
  commandLocation,
  contentAddress,
  type DocumentCommandContext,
  type DocumentCommandHandler,
  htmlWithIds,
  identifyAddedNode,
} from './document-command-core.ts'
import type { CommandContentAddress, DocumentCommand } from './document-commands.ts'

type Handler<Type extends DocumentCommand['type']> = (
  context: DocumentCommandContext,
  command: Extract<DocumentCommand, { type: Type }>,
) => ReturnType<DocumentCommandHandler>

function setChange(target: Record<string, unknown>, fields: Record<string, unknown>) {
  const names = Object.keys(fields)
  return {
    fields: Object.fromEntries(names.filter((name) => fields[name] !== undefined).map((name) => [name, fields[name]])),
    unset: names.filter((name) => fields[name] === undefined),
    prior: Object.fromEntries(names.filter((name) => target[name] !== undefined).map((name) => [name, target[name]])),
    priorAbsent: names.filter((name) => target[name] === undefined),
  }
}

const add: Handler<'add'> = (context, command) => {
  const { node, added } = identifyAddedNode(context, command.node)
  const location = commandLocation(context, command.at)
  const result = applyCommandOps(context, [{ type: 'insert', ...location, node: node as never }], added)
  return { ...result, added: [...new Set([...result.added, ...addedBlocks(context.document, result.document)])] }
}

const remove: Handler<'remove'> = (context, command) => {
  const found = resolveNode(context.document, command.node)
  if (found.node.id === context.document.id) throw new DocumentCommandRefusal('the document root cannot be removed', 'remove one of its child nodes instead')
  return applyCommandOps(context, [{ type: 'remove', id: found.node.id, prior: found.node as never, parent: found.parent, index: found.index }])
}

const move: Handler<'move'> = (context, command) => {
  const found = resolveNode(context.document, command.node)
  if (found.node.id === context.document.id) throw new DocumentCommandRefusal('the document root cannot be moved', 'move one of its child nodes instead')
  const location = commandLocation(context, command.to, found)
  return applyCommandOps(context, [{ type: 'move', id: found.node.id, ...location, priorParent: found.parent, priorIndex: found.index }])
}

const set: Handler<'set'> = (context, command) => {
  const found = resolveNode(context.document, command.node)
  const identity = ['id', 'type', 'kind'].find((field) => field in command.fields)
  if (identity) throw new DocumentCommandRefusal(`identity field "${identity}" cannot be set`, 'remove it from fields')
  return applyCommandOps(context, [{ type: 'setFields', id: found.node.id, ...setChange(found.node, command.fields) }])
}

function htmlValue(context: DocumentCommandContext, address: ReturnType<typeof contentAddress>, source: string): { value: unknown; added: string[] } {
  const identified = htmlWithIds(context, source, {
    node: address.node.id,
    field: address.field,
    ...(address.key === undefined ? {} : { key: address.key }),
  })
  const prior = address.node[address.field]
  const shape =
    address.node.type === 'page' && address.field === 'body'
      ? 'pageBody'
      : address.node.type === 'slide' && address.field === 'content'
        ? 'slide'
        : address.key
          ? 'record'
          : 'html'
  if (shape === 'pageBody') return { value: { ...(prior as object), html: identified.html }, added: identified.added }
  if (shape === 'slide') return { value: { ...(prior as object), kind: 'html', html: identified.html }, added: identified.added }
  if (shape === 'record') return { value: { ...(prior as object), [address.key as string]: identified.html }, added: identified.added }
  return { value: identified.html, added: identified.added }
}

const setContent: Handler<'setContent'> = (context, command) => {
  const address = contentAddress(context, command.content)
  const prior = address.node[address.field]
  const next = command.html === undefined ? { value: command.value, added: [] } : htmlValue(context, address, command.html)
  const op: DocumentOp = {
    type: 'setContent',
    id: address.node.id,
    field: address.field,
    content: next.value,
    ...(prior === undefined ? { priorAbsent: true } : { prior }),
  }
  const result = applyCommandOps(context, [op], next.added)
  return { ...result, added: [...new Set([...result.added, ...addedBlocks(context.document, result.document)])] }
}

const setStyle: Handler<'setStyle'> = (context, command) =>
  applyCommandOps(context, [{ type: 'setStyle', ...setChange(context.document.style ?? {}, command.fields) }])

function resolvedContentAddress(context: DocumentCommandContext, input: unknown): ContentAddress {
  if (!input || typeof input !== 'object') throw new DocumentCommandRefusal('content address is invalid', 'pass { node: { id } or { name }, field, key? }')
  const address = input as CommandContentAddress
  const resolved = contentAddress(context, address)
  return { node: resolved.node.id, field: resolved.field, ...(resolved.key === undefined ? {} : { key: resolved.key }) }
}

function blockPosition(context: DocumentCommandContext, input: unknown): BlockPosition {
  if (!input || typeof input !== 'object') throw new DocumentCommandRefusal('block position is invalid', 'pass before, after, or in with an address')
  const position = input as Record<string, unknown>
  if (typeof position.before === 'string') return { before: position.before }
  if (typeof position.after === 'string') return { after: position.after }
  if (position.in && (position.at === 'start' || position.at === 'end')) return { in: resolvedContentAddress(context, position.in), at: position.at }
  throw new DocumentCommandRefusal('block position is invalid', 'pass before, after, or in with start or end')
}

const insertBlockHandler: Handler<'insertBlock'> = (context, command) => {
  const result = insertBlock(context.document, { html: command.html, position: blockPosition(context, command.position) }, context.options)
  const applied = applyCommandOps(context, result.ops, [result.id])
  return { ...applied, added: [...new Set([...applied.added, ...addedBlocks(context.document, applied.document)])] }
}

const setBlockHandler: Handler<'setBlock'> = (context, command) => {
  const ops = setBlock(context.document, command.block, command.change as SetBlockChange, context.options)
  const result = applyCommandOps(context, ops)
  return { ...result, added: addedBlocks(context.document, result.document) }
}

const moveBlockHandler: Handler<'moveBlock'> = (context, command) =>
  applyCommandOps(context, moveBlock(context.document, command.block, blockPosition(context, command.position), context.options))

const removeBlockHandler: Handler<'removeBlock'> = (context, command) => applyCommandOps(context, removeBlock(context.document, command.block, context.options))

export const DOCUMENT_COMMAND_HANDLERS: { [Type in DocumentCommand['type']]: Handler<Type> } = {
  add,
  remove,
  move,
  set,
  setContent,
  setStyle,
  insertBlock: insertBlockHandler,
  setBlock: setBlockHandler,
  moveBlock: moveBlockHandler,
  removeBlock: removeBlockHandler,
}
