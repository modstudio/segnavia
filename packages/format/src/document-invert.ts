import type { Document as DocumentValue } from './document.ts'
import { fingerprintDocument } from './document-fingerprint.ts'
import type { DocumentBatch, DocumentOp } from './document-op.ts'

function invertOp(op: DocumentOp): DocumentOp {
  switch (op.type) {
    case 'insert':
      return { type: 'remove', id: op.node.id as string, prior: op.node, parent: op.parent, index: op.index }
    case 'remove':
      return { type: 'insert', node: op.prior, parent: op.parent, index: op.index }
    case 'move':
      return {
        ...op,
        parent: op.priorParent,
        index: op.priorIndex,
        priorParent: op.parent,
        priorIndex: op.index,
      }
    case 'setFields':
      return { ...op, fields: op.prior, unset: op.priorAbsent, prior: op.fields, priorAbsent: op.unset }
    case 'setContent':
      return {
        type: 'setContent',
        id: op.id,
        field: op.field,
        ...('priorAbsent' in op ? { unset: true as const } : { content: op.prior }),
        ...('unset' in op ? { priorAbsent: true as const } : { prior: op.content }),
      }
    case 'setStyle':
      return { ...op, fields: op.prior, unset: op.priorAbsent, prior: op.fields, priorAbsent: op.unset }
  }
}

export function invertOps(ops: readonly DocumentOp[]): DocumentOp[] {
  return [...ops].reverse().map(invertOp)
}

export function inverseBatch(batch: DocumentBatch, after: DocumentValue): DocumentBatch {
  return { base: fingerprintDocument(after), ops: invertOps(batch.ops) }
}
