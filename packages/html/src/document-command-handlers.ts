import type { DocumentOp } from '@segnavia/format'
import { type ContentAddress, contentFieldShape, type FragmentShape, fragmentShapeTakesKey, writeFragment } from './block-fragments.ts'
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
  identifiedContentValue,
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
  const descendants = new Set<string>([found.node.id])
  const visit = (node: typeof found.node): void => {
    for (const child of node.children ?? []) {
      descendants.add(child.id)
      visit(child)
    }
  }
  visit(found.node)
  if (location.parent.kind === 'node' && descendants.has(location.parent.id)) {
    throw new DocumentCommandRefusal(`node "${found.node.id}" cannot move into its own subtree`, 'choose a location outside that node')
  }
  return applyCommandOps(context, [{ type: 'move', id: found.node.id, ...location, priorParent: found.parent, priorIndex: found.index }])
}

const set: Handler<'set'> = (context, command) => {
  const found = resolveNode(context.document, command.node)
  const identity = ['id', 'type', 'kind'].find((field) => field in command.fields)
  if (identity) throw new DocumentCommandRefusal(`identity field "${identity}" cannot be set`, 'remove it from fields')
  return applyCommandOps(context, [{ type: 'setFields', id: found.node.id, ...setChange(found.node, command.fields) }])
}

function addressedShape(address: ReturnType<typeof contentAddress>): FragmentShape {
  const shape = contentFieldShape(address.node.type as Parameters<typeof contentFieldShape>[0], address.field)
  const keyed = fragmentShapeTakesKey(shape)
  if (keyed && address.key === undefined) {
    throw new DocumentCommandRefusal(`record content field "${address.field}" requires a key`, 'supply the record key')
  }
  if (!keyed && address.key !== undefined) {
    throw new DocumentCommandRefusal(`content field "${address.field}" takes no key`, 'remove the key')
  }
  if (shape === 'regionRecord' && address.key !== undefined) {
    const regions = address.node[address.field]
    if (!regions || typeof regions !== 'object' || !(address.key in regions)) {
      throw new DocumentCommandRefusal(
        `region "${address.key}" is not present in content field "${address.field}"`,
        `add it with its edge through set on "${address.field}"`,
      )
    }
  }
  return shape
}

function htmlValue(
  context: DocumentCommandContext,
  address: ReturnType<typeof contentAddress>,
  source: string,
  shape: FragmentShape,
): { value: unknown; added: string[] } {
  if (shape === 'text') throw new DocumentCommandRefusal(`content field "${address.field}" holds text, not HTML`, 'use value instead of html')
  const prior = address.node[address.field]
  if (shape === 'slideContent' && (typeof prior !== 'object' || prior === null || (prior as { kind?: unknown }).kind !== 'html')) {
    throw new DocumentCommandRefusal(`content field "${address.field}" does not currently hold HTML`, 'use value to replace its schema-native content')
  }
  const identified = htmlWithIds(context, source, {
    node: address.node.id,
    field: address.field,
    ...(address.key === undefined ? {} : { key: address.key }),
  })
  return { value: writeFragment(shape, prior, identified.html, address.key), added: identified.added }
}

function nativeValue(
  context: DocumentCommandContext,
  address: ReturnType<typeof contentAddress>,
  value: unknown,
  shape: FragmentShape,
): { value: unknown; added: string[] } {
  if (shape !== 'record' && shape !== 'regionRecord') return identifiedContentValue(context, address, value)
  if (shape === 'regionRecord') {
    const key = address.key as string
    const regions = address.node[address.field] as Record<string, { edge: unknown; html: unknown }>
    const supplied = value && typeof value === 'object' ? (value as Record<string, unknown>) : { html: value }
    const identified = identifiedContentValue(context, address, { [key]: { ...supplied, edge: regions[key]?.edge } })
    const region = (identified.value as Record<string, unknown>)[key]
    return { value: { ...regions, [key]: region }, added: identified.added }
  }
  const identified = identifiedContentValue(context, address, { [address.key as string]: value })
  const html = (identified.value as Record<string, unknown>)[address.key as string]
  return { value: { ...(address.node[address.field] as object), [address.key as string]: html }, added: identified.added }
}

const setContent: Handler<'setContent'> = (context, command) => {
  const address = contentAddress(context, command.content)
  const shape = addressedShape(address)
  const prior = address.node[address.field]
  const next = command.html === undefined ? nativeValue(context, address, command.value, shape) : htmlValue(context, address, command.html, shape)
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
