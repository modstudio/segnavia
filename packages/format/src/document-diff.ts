import type { Document as DocumentValue } from './document.ts'
import { requireParsedDocument } from './document-fingerprint.ts'
import type { DocumentLocation, DocumentOp } from './document-op.ts'
import { sameValue } from './document-op-equal.ts'
import {
  DOCUMENT_ROOT_FIELDS,
  DOCUMENT_STYLE_FIELDS,
  type OperationDocument as Doc,
  documentContainer,
  documentEntries,
  findDocumentNode,
  type OperationNode as Node,
  nodeModel,
} from './document-op-model.ts'

const entries = documentEntries
const locate = findDocumentNode
const container = (document: Doc, location: DocumentLocation): Node[] =>
  documentContainer(document, location, (reason) => {
    throw new Error(`diffDocuments refused: ${reason}; compare documents with valid operation parents to clear this refusal`)
  })

function stripped(node: Node): Node {
  return node.children ? { ...structuredClone(node), children: [] } : structuredClone(node)
}

function insertMissing(working: Doc, target: Doc, known: ReadonlySet<string>, ops: DocumentOp[]): void {
  for (const entry of entries(target)) {
    if (known.has(entry.node.id)) continue
    const node = stripped(entry.node)
    const held = container(working, entry.parent)
    const index = held.length
    ops.push({ type: 'insert', parent: entry.parent, index, node: structuredClone(node) as never })
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

function removeBoardMembers(current: string[], desired: readonly string[], section: string, ops: DocumentOp[]): void {
  for (const item of [...current]) {
    if (desired.includes(item)) continue
    const at = current.indexOf(item)
    ops.push({ type: 'setMember', section, item, from: { after: at === 0 ? null : (current[at - 1] as string) }, to: null })
    current.splice(at, 1)
  }
}

function placeBoardMembers(current: string[], desired: readonly string[], section: string, ops: DocumentOp[]): void {
  for (let at = 0; at < desired.length; at += 1) {
    const item = desired[at] as string
    const desiredAfter = at === 0 ? null : (desired[at - 1] as string)
    const currentAt = current.indexOf(item)
    const actualAfter = currentAt < 0 ? null : currentAt === 0 ? null : (current[currentAt - 1] as string)
    if (currentAt >= 0 && actualAfter === desiredAfter) continue
    ops.push({ type: 'setMember', section, item, from: currentAt < 0 ? null : { after: actualAfter }, to: { after: desiredAfter } })
    if (currentAt >= 0) current.splice(currentAt, 1)
    current.splice(at, 0, item)
  }
}

function appendBoardSectionChanges(old: Node, node: Node, ops: DocumentOp[]): void {
  const current = [...(old.items as string[])]
  const desired = node.items as string[]
  removeBoardMembers(current, desired, node.id, ops)
  placeBoardMembers(current, desired, node.id, ops)
  const from = (old.cells as Extract<DocumentOp, { type: 'setCells' }>['from'] | undefined) ?? null
  const to = (node.cells as Extract<DocumentOp, { type: 'setCells' }>['to'] | undefined) ?? null
  if (!sameValue(from, to)) ops.push({ type: 'setCells', section: node.id, from: structuredClone(from), to: structuredClone(to) })
}

function setChanges(before: Doc, after: Doc, common: ReadonlySet<string>, ops: DocumentOp[]): void {
  const beforeById = new Map(entries(before).map(({ node }) => [node.id, node]))
  for (const { node } of entries(after)) {
    if (!common.has(node.id)) continue
    const old = beforeById.get(node.id) as Node
    const model = nodeModel(node.type)
    if (!model || old.type !== node.type) throw new Error(`diffDocuments refused: node "${node.id}" changed type; use a new id to clear this refusal`)
    appendContentChanges(old, node, model.content, ops)
    if (node.type === 'boardSection') appendBoardSectionChanges(old, node, ops)
    const held = change(old, node, model.settable)
    if (hasChange(held)) ops.push({ type: 'setFields', id: node.id, ...held })
  }
}

export function diffDocuments(left: DocumentValue, right: DocumentValue): DocumentOp[] {
  const before = structuredClone(requireParsedDocument(left, 'diffDocuments first document')) as unknown as Doc
  const after = structuredClone(requireParsedDocument(right, 'diffDocuments second document')) as unknown as Doc
  if (before.kind !== after.kind)
    throw new Error(`diffDocuments refused: document kinds ${before.kind} and ${after.kind} differ; compare documents of one kind to clear this refusal`)
  if (before.id !== after.id)
    throw new Error(`diffDocuments refused: root ids "${before.id}" and "${after.id}" differ; compare documents that share a root id to clear this refusal`)
  const beforeIds = new Set(entries(before).map(({ node }) => node.id))
  const afterIds = new Set(entries(after).map(({ node }) => node.id))
  const common = new Set([...beforeIds].filter((id) => afterIds.has(id)))
  const ops: DocumentOp[] = []
  const working = structuredClone(before)
  insertMissing(working, after, beforeIds, ops)
  reconcileOrder(working, after, ops)
  const root = change(before, after, DOCUMENT_ROOT_FIELDS)
  if (hasChange(root)) ops.push({ type: 'setFields', id: before.id, ...root })
  setChanges(before, after, common, ops)
  removeMissing(working, afterIds, ops)
  const style = change(before.style ?? {}, after.style ?? {}, DOCUMENT_STYLE_FIELDS)
  if (hasChange(style)) ops.push({ type: 'setStyle', ...style })
  return ops
}
