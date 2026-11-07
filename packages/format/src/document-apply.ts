import { sameValue } from './board-op-equal.ts'
import { Document, type Document as DocumentValue } from './document.ts'
import { fingerprintDocument } from './document-fingerprint.ts'
import { DocumentBatch, type DocumentLocation, type DocumentOp } from './document-op.ts'
import { DOCUMENT_ROOT_FIELDS, DOCUMENT_STYLE_FIELDS, nodeModel } from './document-op-model.ts'

type Held = Record<string, unknown>
type HeldNode = Held & { id: string; type: string }
type HeldDocument = HeldNode & { children: HeldNode[]; style?: Held; [key: string]: unknown }

interface Found {
  node: HeldNode
  parent: DocumentLocation
  index: number
}

const clearance = 'rebuild the batch against the current document'
const shown = (value: unknown): string => (value === undefined ? 'absent' : JSON.stringify(value))

function refuse(index: number, op: DocumentOp, reason: string): never {
  throw new Error(`document op ${index} (${op.type}) refused: ${reason}; ${clearance}`)
}

function walk(document: HeldDocument): Found[] {
  const found: Found[] = []
  const visit = (nodes: HeldNode[], parent: DocumentLocation): void => {
    nodes.forEach((node, index) => {
      found.push({ node, parent, index })
      if (Array.isArray(node.children)) visit(node.children as HeldNode[], { kind: 'node', id: node.id })
    })
  }
  visit(document.children, { kind: 'node', id: document.id })
  for (const name of ['parentPages', 'templates', 'noteSeries', 'variables', 'conditions'] as const) {
    const nodes = document[name] as HeldNode[]
    nodes.forEach((node, index) => {
      found.push({ node, parent: { kind: 'collection', name }, index })
    })
  }
  return found
}

function find(document: HeldDocument, id: string): Found | undefined {
  return walk(document).find(({ node }) => node.id === id)
}

function sameLocation(left: DocumentLocation, right: DocumentLocation): boolean {
  return sameValue(left, right)
}

function entries(document: HeldDocument, location: DocumentLocation, index: number, op: DocumentOp): HeldNode[] {
  if (location.kind === 'collection') return document[location.name] as HeldNode[]
  if (location.id === document.id) return document.children
  const parent = find(document, location.id)?.node
  if (!parent) refuse(index, op, `parent node "${location.id}" is missing`)
  if (!nodeModel(parent.type)?.children || !Array.isArray(parent.children)) refuse(index, op, `parent node "${location.id}" cannot hold child nodes`)
  return parent.children as HeldNode[]
}

function checkNodeLocation(node: HeldNode, location: DocumentLocation, index: number, op: DocumentOp): void {
  const expectedCollection = nodeModel(node.type)?.collection
  if (location.kind === 'collection' && expectedCollection !== location.name) {
    refuse(index, op, `collection "${location.name}" cannot hold node type "${node.type}"`)
  }
  if (location.kind === 'node' && expectedCollection) refuse(index, op, `node type "${node.type}" belongs in collection "${expectedCollection}"`)
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

function checkPrior(target: Held, op: Extract<DocumentOp, { type: 'setFields' | 'setStyle' }>, fields: readonly string[], index: number): void {
  for (const field of fields) {
    const expected = op.priorAbsent.includes(field) ? undefined : op.prior[field]
    if (!sameValue(target[field], expected)) refuse(index, op, `field "${field}" expected ${shown(expected)} but found ${shown(target[field])}`)
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
  if (find(document, node.id)) refuse(index, op, `node "${node.id}" already exists`)
  checkNodeLocation(node, op.parent, index, op)
  const target = entries(document, op.parent, index, op)
  if (op.index > target.length) refuse(index, op, `index ${op.index} is outside 0..${target.length}`)
  target.splice(op.index, 0, structuredClone(node))
}

function applyStyle(document: HeldDocument, op: Extract<DocumentOp, { type: 'setStyle' }>, index: number): void {
  const target = document.style ?? {}
  const fields = checkedChange(op, DOCUMENT_STYLE_FIELDS, index)
  checkPrior(target, op, fields, index)
  applyChange(target, op, fields)
  if (Object.keys(target).length === 0) delete document.style
  else document.style = target
}

function applyRoot(document: HeldDocument, op: Exclude<DocumentOp, { type: 'insert' | 'setStyle' }>, index: number): void {
  if (op.type !== 'setFields' || op.id !== document.id) refuse(index, op, `node "${op.id}" is missing`)
  const fields = checkedChange(op, DOCUMENT_ROOT_FIELDS, index)
  checkPrior(document, op, fields, index)
  applyChange(document, op, fields)
}

function applyRemove(document: HeldDocument, op: Extract<DocumentOp, { type: 'remove' }>, found: Found, index: number): void {
  if (!sameLocation(found.parent, op.parent) || found.index !== op.index) refuse(index, op, `node "${op.id}" is not at its prior parent and index`)
  if (!sameValue(found.node, op.prior)) refuse(index, op, `node "${op.id}" does not match its prior value`)
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
      refuse(index, op, `node "${op.id}" field "${op.field}" expected ${shown(expected)} but found ${shown(found.node[op.field])}`)
    if ('unset' in op) delete found.node[op.field]
    else found.node[op.field] = structuredClone(op.content)
    return
  }
  const allowed = new Set([...model.fields].filter((field) => !['type', 'id', 'children'].includes(field) && !model.content.has(field)))
  const fields = checkedChange(op, allowed, index)
  checkPrior(found.node, op, fields, index)
  applyChange(found.node, op, fields)
}

function applyOne(document: HeldDocument, op: DocumentOp, index: number): void {
  if (op.type === 'insert') {
    applyInsert(document, op, index)
    return
  }
  if (op.type === 'setStyle') {
    applyStyle(document, op, index)
    return
  }
  const found = find(document, op.id)
  if (!found) {
    applyRoot(document, op, index)
    return
  }
  if (op.type === 'remove') applyRemove(document, op, found, index)
  else if (op.type === 'move') applyMove(document, op, found, index)
  else applyNodeSet(op, found, index)
}

function parseBatch(batch: DocumentBatch): DocumentBatch {
  const result = DocumentBatch.safeParse(batch)
  if (result.success) return result.data
  throw new Error(`document batch refused: ${result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}; ${clearance}`)
}

function stale(document: HeldDocument, batch: DocumentBatch, actual: string): never {
  const mismatches: string[] = []
  const probe = structuredClone(document)
  batch.ops.forEach((op, index) => {
    try {
      applyOne(probe, op, index)
    } catch (error) {
      mismatches.push(error instanceof Error ? error.message : String(error))
    }
  })
  if (mismatches.length > 0) throw new Error(`document batch stale: ${mismatches.join('; ')}; ${clearance}`)
  throw new Error(`document batch stale: document changed outside the batch's targets (expected fingerprint ${batch.base}, found ${actual}); ${clearance}`)
}

export function applyOps(document: DocumentValue, input: DocumentBatch): DocumentValue {
  const batch = parseBatch(input)
  const actual = fingerprintDocument(document)
  const working = structuredClone(document) as unknown as HeldDocument
  if (actual !== batch.base) stale(working, batch, actual)
  batch.ops.forEach((op, index) => {
    applyOne(working, op, index)
  })
  const parsed = Document.parse(working)
  if (!sameValue(parsed, working)) throw new Error(`document op list refused: parsing the result would mint ids or change fields; ${clearance}`)
  return parsed
}
