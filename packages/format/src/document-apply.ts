import { Document, type Document as DocumentValue, defaultSectionContents } from './document.ts'
import { fingerprintDocument, requireParsedDocument } from './document-fingerprint.ts'
import type { DocumentNode } from './document-nodes.ts'
import { DocumentBatch, type DocumentLocation, type DocumentOp } from './document-op.ts'
import { insertAfter, predecessor } from './document-op-anchor.ts'
import { sameValue } from './document-op-equal.ts'
import {
  DOCUMENT_ROOT_FIELDS,
  DOCUMENT_STYLE_FIELDS,
  type DocumentEntry,
  documentContainer,
  findDocumentNode,
  nodeModel,
  type OperationDocument,
  type OperationNode,
} from './document-op-model.ts'
import { DOCUMENT_PROFILES, type DocumentKind } from './document-profile.ts'
import { shownValue } from './shown-value.ts'

type Held = Record<string, unknown>
type HeldNode = OperationNode
type HeldDocument = OperationDocument
type Found = DocumentEntry

const clearance = 'rebuild the batch against the current document'

function refuse(index: number, op: DocumentOp, reason: string): never {
  throw new Error(`document op ${index} (${op.type}) refused: ${reason}; ${clearance}`)
}

function sameLocation(left: DocumentLocation, right: DocumentLocation): boolean {
  return sameValue(left, right)
}

function entries(document: HeldDocument, location: DocumentLocation, index: number, op: DocumentOp): HeldNode[] {
  return documentContainer(document, location, (reason) => refuse(index, op, reason))
}

function checkNodeLocation(node: HeldNode, location: DocumentLocation, index: number, op: DocumentOp): void {
  const expectedCollection = nodeModel(node.type)?.collection
  if (location.kind === 'collection' && expectedCollection !== location.name) {
    refuse(index, op, `collection "${location.name}" cannot hold node type "${node.type}"`)
  }
  if (location.kind === 'node' && expectedCollection) refuse(index, op, `node type "${node.type}" belongs in collection "${expectedCollection}"`)
}

function nodeWithDefaults(document: HeldDocument, node: HeldNode): HeldNode {
  const defaultsContents = (DOCUMENT_PROFILES[document.kind as DocumentKind].sectionFields as readonly string[]).includes('contents')
  return defaultSectionContents([structuredClone(node) as DocumentNode], defaultsContents)[0] as HeldNode
}

function checkedChange(op: Extract<DocumentOp, { type: 'setFields' | 'setStyle' }>, allowed: ReadonlySet<string>, index: number): string[] {
  const next = [...Object.keys(op.fields), ...op.unset]
  const prior = [...Object.keys(op.prior), ...op.priorAbsent]
  if (new Set(next).size !== next.length || new Set(prior).size !== prior.length || !sameValue([...next].sort(), [...prior].sort())) {
    refuse(index, op, 'fields/unset and prior/priorAbsent must name the same unique keys')
  }
  for (const field of next) if (!allowed.has(field)) refuse(index, op, `field "${field}" is not settable by this operation`)
  return next
}

function checkPrior(
  target: Held,
  targetId: string,
  op: Extract<DocumentOp, { type: 'setFields' | 'setStyle' }>,
  fields: readonly string[],
  index: number,
): void {
  for (const field of fields) {
    const expected = op.priorAbsent.includes(field) ? undefined : op.prior[field]
    if (!sameValue(target[field], expected))
      refuse(index, op, `node "${targetId}" field "${field}" expected ${shownValue(expected)} but found ${shownValue(target[field])}`)
  }
}

function applyChange(target: Held, op: Extract<DocumentOp, { type: 'setFields' | 'setStyle' }>, fields: readonly string[]): void {
  for (const field of fields) {
    if (op.unset.includes(field)) delete target[field]
    else target[field] = structuredClone(op.fields[field])
  }
}

function applyInsert(document: HeldDocument, op: Extract<DocumentOp, { type: 'insert' }>, index: number): void {
  const node = op.node as HeldNode
  if (!node.id) refuse(index, op, 'inserted node has no id')
  if (findDocumentNode(document, node.id)) refuse(index, op, `node "${node.id}" already exists`)
  checkNodeLocation(node, op.parent, index, op)
  const target = entries(document, op.parent, index, op)
  if (op.index > target.length) refuse(index, op, `index ${op.index} is outside 0..${target.length}`)
  target.splice(op.index, 0, nodeWithDefaults(document, node))
}

function applyStyle(document: HeldDocument, op: Extract<DocumentOp, { type: 'setStyle' }>, index: number): void {
  const target = document.style ?? {}
  const fields = checkedChange(op, DOCUMENT_STYLE_FIELDS, index)
  checkPrior(target, document.id, op, fields, index)
  applyChange(target, op, fields)
  if (Object.keys(target).length === 0) delete document.style
  else document.style = target
}

function applyRoot(document: HeldDocument, op: Extract<DocumentOp, { id: string }>, index: number): void {
  if (op.type !== 'setFields' || op.id !== document.id) refuse(index, op, `node "${op.id}" is missing`)
  const fields = checkedChange(op, DOCUMENT_ROOT_FIELDS, index)
  checkPrior(document, document.id, op, fields, index)
  applyChange(document, op, fields)
}

function applyRemove(document: HeldDocument, op: Extract<DocumentOp, { type: 'remove' }>, found: Found, index: number): void {
  if (!sameLocation(found.parent, op.parent) || found.index !== op.index) refuse(index, op, `node "${op.id}" is not at its prior parent and index`)
  if (!sameValue(found.node, nodeWithDefaults(document, op.prior as HeldNode))) refuse(index, op, `node "${op.id}" does not match its prior value`)
  entries(document, found.parent, index, op).splice(found.index, 1)
}

function applyMove(document: HeldDocument, op: Extract<DocumentOp, { type: 'move' }>, found: Found, index: number): void {
  if (!sameLocation(found.parent, op.priorParent) || found.index !== op.priorIndex) refuse(index, op, `node "${op.id}" is not at its prior parent and index`)
  checkNodeLocation(found.node, op.parent, index, op)
  entries(document, found.parent, index, op).splice(found.index, 1)
  const target = entries(document, op.parent, index, op)
  if (op.index > target.length) refuse(index, op, `index ${op.index} is outside 0..${target.length}`)
  target.splice(op.index, 0, found.node)
}

function applyNodeSet(op: Extract<DocumentOp, { type: 'setFields' | 'setContent' }>, found: Found, index: number): void {
  const model = nodeModel(found.node.type)
  if (!model) refuse(index, op, `node type "${found.node.type}" has no operation model`)
  if (op.type === 'setContent') {
    if (!model.content.has(op.field)) refuse(index, op, `field "${op.field}" is not content on node type "${found.node.type}"`)
    const expected = 'priorAbsent' in op ? undefined : op.prior
    if (!sameValue(found.node[op.field], expected))
      refuse(index, op, `node "${op.id}" field "${op.field}" expected ${shownValue(expected)} but found ${shownValue(found.node[op.field])}`)
    if ('unset' in op) delete found.node[op.field]
    else found.node[op.field] = structuredClone(op.content)
    return
  }
  const fields = checkedChange(op, model.settable, index)
  checkPrior(found.node, found.node.id, op, fields, index)
  applyChange(found.node, op, fields)
}

function boardSection(document: HeldDocument, id: string, op: DocumentOp, index: number): HeldNode {
  if (document.kind !== 'board') refuse(index, op, `${op.type} is valid only on a board document`)
  const section = findDocumentNode(document, id)?.node
  if (section?.type !== 'boardSection') refuse(index, op, `section "${id}" is missing`)
  return section
}

function applyMember(document: HeldDocument, op: Extract<DocumentOp, { type: 'setMember' }>, index: number): void {
  const section = boardSection(document, op.section, op, index)
  const held = section.items as string[]
  const actual = held.includes(op.item) ? { after: predecessor(held, op.item, (id) => id) } : null
  if (!sameValue(actual, op.from)) refuse(index, op, `section "${op.section}" member "${op.item}" does not match from`)
  let items = held.filter((id) => id !== op.item)
  if (op.to) {
    const item = findDocumentNode(document, op.item)?.node
    if (item?.type !== 'item') refuse(index, op, `section "${op.section}" item "${op.item}" is missing`)
    items = insertAfter(
      items,
      op.item,
      op.to.after,
      (id) => id,
      (reason) => refuse(index, op, `section "${op.section}" item "${op.item}": ${reason}`),
    )
  }
  section.items = items
}

function applyCells(document: HeldDocument, op: Extract<DocumentOp, { type: 'setCells' }>, index: number): void {
  const section = boardSection(document, op.section, op, index)
  if (!sameValue(section.cells ?? null, op.from)) refuse(index, op, `section "${op.section}" cells do not match from`)
  if (op.to === null) delete section.cells
  else section.cells = structuredClone(op.to)
}

export function applyDocumentOp(document: OperationDocument, op: DocumentOp, index: number): void {
  if (op.type === 'setMember') {
    applyMember(document, op, index)
    return
  }
  if (op.type === 'setCells') {
    applyCells(document, op, index)
    return
  }
  if (op.type === 'insert') {
    applyInsert(document, op, index)
    return
  }
  if (op.type === 'setStyle') {
    applyStyle(document, op, index)
    return
  }
  const found = findDocumentNode(document, op.id)
  if (!found) {
    applyRoot(document, op, index)
    return
  }
  if (op.type === 'remove') applyRemove(document, op, found, index)
  else if (op.type === 'move') applyMove(document, op, found, index)
  else applyNodeSet(op, found, index)
}

export function finishDocumentOps(working: OperationDocument): DocumentValue {
  let parsed: DocumentValue
  try {
    parsed = Document.parse(working)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`document batch refused: the result is not a valid document (${reason}); ${clearance}`)
  }
  if (!sameValue(parsed, working)) throw new Error(`document batch refused: parsing the result would mint ids or change fields; ${clearance}`)
  return parsed
}

export function parseDocumentBatch(batch: DocumentBatch): DocumentBatch {
  for (const [index, candidate] of ((batch as unknown as { ops?: unknown[] }).ops ?? []).entries()) {
    if (typeof candidate !== 'object' || candidate === null || (candidate as { type?: unknown }).type !== 'setContent') continue
    const op = candidate as Record<string, unknown>
    if ('content' in op && 'unset' in op)
      throw new Error(`document op ${index} (setContent) refused: keys "content" and "unset" cannot both be present; remove one and rebuild the batch`)
    if ('prior' in op && 'priorAbsent' in op)
      throw new Error(`document op ${index} (setContent) refused: keys "prior" and "priorAbsent" cannot both be present; remove one and rebuild the batch`)
  }
  const result = DocumentBatch.safeParse(batch)
  if (result.success) return result.data
  throw new Error(`document batch refused: ${result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}; ${clearance}`)
}

function stale(document: HeldDocument, batch: DocumentBatch, actual: string): never {
  const mismatches: string[] = []
  const probe = structuredClone(document)
  batch.ops.forEach((op, index) => {
    try {
      applyDocumentOp(probe, op, index)
    } catch (error) {
      mismatches.push(error instanceof Error ? error.message : String(error))
    }
  })
  if (mismatches.length > 0) throw new Error(`document batch stale: ${mismatches.join('; ')}; ${clearance}`)
  throw new Error(`document batch stale: document changed outside the batch's targets (expected fingerprint ${batch.base}, found ${actual}); ${clearance}`)
}

export function applyOps(document: DocumentValue, input: DocumentBatch): DocumentValue {
  requireParsedDocument(document, 'applyOps')
  const batch = parseDocumentBatch(input)
  const actual = fingerprintDocument(document)
  const working = structuredClone(document) as unknown as HeldDocument
  if (actual !== batch.base) stale(working, batch, actual)
  batch.ops.forEach((op, index) => {
    applyDocumentOp(working, op, index)
  })
  return finishDocumentOps(working)
}
