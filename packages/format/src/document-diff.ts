import { sameValue } from './board-op-equal.ts'
import { Document, type Document as DocumentValue } from './document.ts'
import type { DocumentLocation, DocumentOp } from './document-op.ts'
import { DOCUMENT_ROOT_FIELDS, DOCUMENT_STYLE_FIELDS, nodeModel } from './document-op-model.ts'

type Node = Record<string, unknown> & { id: string; type: string; children?: Node[] }
type Doc = Record<string, unknown> & { id: string; kind: string; children: Node[]; style?: Record<string, unknown> }
interface Entry {
  node: Node
  parent: DocumentLocation
  index: number
  depth: number
}

const COLLECTIONS = ['parentPages', 'templates', 'noteSeries', 'variables', 'conditions'] as const

function entries(document: Doc): Entry[] {
  const result: Entry[] = []
  const visit = (nodes: Node[], parent: DocumentLocation, depth: number): void => {
    nodes.forEach((node, index) => {
      result.push({ node, parent, index, depth })
      if (node.children) visit(node.children, { kind: 'node', id: node.id }, depth + 1)
    })
  }
  visit(document.children, { kind: 'node', id: document.id }, 0)
  for (const name of COLLECTIONS) {
    const nodes = document[name] as Node[]
    nodes.forEach((node, index) => {
      result.push({ node, parent: { kind: 'collection', name }, index, depth: 0 })
    })
  }
  return result
}

function locate(document: Doc, id: string): Entry | undefined {
  return entries(document).find((entry) => entry.node.id === id)
}

function container(document: Doc, location: DocumentLocation): Node[] {
  if (location.kind === 'collection') return document[location.name] as Node[]
  if (location.id === document.id) return document.children
  const parent = locate(document, location.id)?.node
  if (!parent?.children) throw new Error(`diffDocuments refused: parent node "${location.id}" cannot hold children`)
  return parent.children
}

function parsed(document: DocumentValue, side: string): Doc {
  const value = Document.parse(document)
  if (!sameValue(value, document)) throw new Error(`diffDocuments refused: ${side} is not a parsed Document; parse it first to clear this refusal`)
  return structuredClone(document) as unknown as Doc
}

function stripped(node: Node): Node {
  return node.children ? { ...structuredClone(node), children: [] } : structuredClone(node)
}

function insertMissing(working: Doc, target: Doc, known: ReadonlySet<string>, ops: DocumentOp[]): void {
  for (const entry of entries(target)) {
    if (known.has(entry.node.id)) continue
    const node = stripped(entry.node)
    const held = container(working, entry.parent)
    const index = held.length
    ops.push({ type: 'insert', parent: entry.parent, index, node: node as never })
    held.push(node)
  }
}

function reconcileOrder(working: Doc, target: Doc, ops: DocumentOp[]): void {
  for (const desired of entries(target)) {
    const current = locate(working, desired.node.id)
    if (!current) throw new Error(`diffDocuments refused: node "${desired.node.id}" could not be placed`)
    if (sameValue(current.parent, desired.parent) && current.index === desired.index) continue
    ops.push({
      type: 'move',
      id: desired.node.id,
      parent: desired.parent,
      index: desired.index,
      priorParent: current.parent,
      priorIndex: current.index,
    })
    container(working, current.parent).splice(current.index, 1)
    container(working, desired.parent).splice(desired.index, 0, current.node)
  }
}

function removeMissing(working: Doc, targetIds: ReadonlySet<string>, ops: DocumentOp[]): void {
  const missing = entries(working)
    .filter(({ node }) => !targetIds.has(node.id))
    .sort((left, right) => right.depth - left.depth)
  for (const candidate of missing) {
    const current = locate(working, candidate.node.id)
    if (!current) continue
    ops.push({ type: 'remove', id: current.node.id, prior: structuredClone(current.node) as never, parent: current.parent, index: current.index })
    container(working, current.parent).splice(current.index, 1)
  }
}

function change(before: Record<string, unknown>, after: Record<string, unknown>, fields: Iterable<string>) {
  const values: Record<string, unknown> = {}
  const prior: Record<string, unknown> = {}
  const unset: string[] = []
  const priorAbsent: string[] = []
  for (const field of fields) {
    if (sameValue(before[field], after[field])) continue
    if (after[field] === undefined) unset.push(field)
    else values[field] = structuredClone(after[field])
    if (before[field] === undefined) priorAbsent.push(field)
    else prior[field] = structuredClone(before[field])
  }
  return { fields: values, unset, prior, priorAbsent }
}

function hasChange(value: ReturnType<typeof change>): boolean {
  return Object.keys(value.fields).length + value.unset.length > 0
}

function appendContentChanges(old: Node, node: Node, fields: ReadonlySet<string>, ops: DocumentOp[]): void {
  for (const field of fields) {
    if (sameValue(old[field], node[field])) continue
    ops.push({
      type: 'setContent',
      id: node.id,
      field,
      ...(node[field] === undefined ? { unset: true as const } : { content: structuredClone(node[field]) }),
      ...(old[field] === undefined ? { priorAbsent: true as const } : { prior: structuredClone(old[field]) }),
    })
  }
}

function setChanges(before: Doc, after: Doc, common: ReadonlySet<string>, ops: DocumentOp[]): void {
  const beforeById = new Map(entries(before).map(({ node }) => [node.id, node]))
  for (const { node } of entries(after)) {
    if (!common.has(node.id)) continue
    const old = beforeById.get(node.id) as Node
    const model = nodeModel(node.type)
    if (!model || old.type !== node.type) throw new Error(`diffDocuments refused: node "${node.id}" changed type; use a new id to clear this refusal`)
    appendContentChanges(old, node, model.content, ops)
    const structural = [...model.fields].filter((field) => !['type', 'id', 'children'].includes(field) && !model.content.has(field))
    const held = change(old, node, structural)
    if (hasChange(held)) ops.push({ type: 'setFields', id: node.id, ...held })
  }
}

export function diffDocuments(left: DocumentValue, right: DocumentValue): DocumentOp[] {
  const before = parsed(left, 'first document')
  const after = parsed(right, 'second document')
  if (before.kind !== after.kind)
    throw new Error(`diffDocuments refused: document kinds ${before.kind} and ${after.kind} differ; compare documents of one kind to clear this refusal`)
  const beforeIds = new Set(entries(before).map(({ node }) => node.id))
  const afterIds = new Set(entries(after).map(({ node }) => node.id))
  const common = new Set([...beforeIds].filter((id) => afterIds.has(id)))
  const ops: DocumentOp[] = []
  const working = structuredClone(before)
  insertMissing(working, after, beforeIds, ops)
  reconcileOrder(working, after, ops)
  removeMissing(working, afterIds, ops)
  const root = change(before, after, DOCUMENT_ROOT_FIELDS)
  if (hasChange(root)) ops.push({ type: 'setFields', id: before.id, ...root })
  setChanges(before, after, common, ops)
  const style = change(before.style ?? {}, after.style ?? {}, DOCUMENT_STYLE_FIELDS)
  if (hasChange(style)) ops.push({ type: 'setStyle', ...style })
  return ops
}
