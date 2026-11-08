import type { Document as DocumentValue } from './document.ts'
import { applyDocumentOp, finishDocumentOps } from './document-apply.ts'
import { requireParsedDocument } from './document-fingerprint.ts'
import { DocumentOp } from './document-op.ts'
import type { OperationDocument } from './document-op-model.ts'

export interface RebaseResult {
  document: DocumentValue
  applied: DocumentOp[]
  conflicts: DocumentOp[]
}

export function rebaseOps(document: DocumentValue, input: readonly DocumentOp[]): RebaseResult {
  const parsed = DocumentOp.array().safeParse(input)
  if (!parsed.success) throw new Error(`rebaseOps refused invalid operations: ${parsed.error.message}`)
  let working = structuredClone(requireParsedDocument(document, 'rebaseOps')) as unknown as OperationDocument
  const applied: DocumentOp[] = []
  const conflicts: DocumentOp[] = []
  parsed.data.forEach((op, index) => {
    const trial = structuredClone(working)
    try {
      applyDocumentOp(trial, op, index)
      working = trial
      applied.push(op)
    } catch {
      conflicts.push(op)
    }
  })
  return { document: finishDocumentOps(working), applied, conflicts }
}
