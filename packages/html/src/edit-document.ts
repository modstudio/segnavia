import { applyOps, type Document, type DocumentBatch, fingerprintDocument } from '@segnavia/format'
import { DocumentCommandRefusal } from './document-addresses.ts'
import type { EditDocumentOptions } from './document-command-core.ts'
import { DOCUMENT_COMMAND_HANDLERS } from './document-command-handlers.ts'
import { DocumentCommand, type DocumentCommand as DocumentCommandValue } from './document-commands.ts'

export interface EditDocumentSuccess {
  ok: true
  document: Document
  batch: DocumentBatch
  added: Record<number, string[]>
}

export interface EditDocumentFailure {
  ok: false
  refusal: string
}

export type EditDocumentResult = EditDocumentSuccess | EditDocumentFailure

function commandType(value: unknown): string {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string' ? (value as { type: string }).type : 'unknown'
}

function refusal(index: number, type: string, problem: string, clearing: string): EditDocumentFailure {
  return { ok: false, refusal: `document command ${index} (${type}) refused: ${problem}; ${clearing}. Nothing was changed.` }
}

function targetsNodeStyle(input: unknown): boolean {
  return typeof input === 'object' && input !== null && (input as { type?: unknown }).type === 'setStyle' && 'node' in input
}

export function editDocument(document: Document, commands: readonly DocumentCommandValue[], options: EditDocumentOptions = {}): EditDocumentResult {
  let base: string
  try {
    base = fingerprintDocument(document)
  } catch (error) {
    return { ok: false, refusal: error instanceof Error ? error.message : String(error) }
  }
  let current = document
  const ops: DocumentBatch['ops'] = []
  const added: Record<number, string[]> = {}
  for (let index = 0; index < commands.length; index += 1) {
    const input: unknown = commands[index]
    if (targetsNodeStyle(input)) {
      return refusal(
        index,
        'setStyle',
        'node styles are not present in the current document model',
        'remove the node address; node styles arrive with the StyleSheet',
      )
    }
    const parsed = DocumentCommand.safeParse(input)
    if (!parsed.success) {
      return refusal(index, commandType(input), parsed.error.issues[0]?.message ?? 'the command is invalid', 'pass a command matching DocumentCommand')
    }
    try {
      const result = DOCUMENT_COMMAND_HANDLERS[parsed.data.type]({ document: current, options, command: index }, parsed.data as never)
      current = result.document
      ops.push(...result.ops)
      added[index] = result.added
    } catch (error) {
      if (error instanceof DocumentCommandRefusal) return refusal(index, parsed.data.type, error.message, error.clearing)
      const message = error instanceof Error ? error.message : String(error)
      return refusal(index, parsed.data.type, message, 'correct the command or document so the step can be established')
    }
  }
  const batch = { base, ops }
  try {
    current = applyOps(document, batch)
  } catch (error) {
    return refusal(commands.length, 'batch', error instanceof Error ? error.message : String(error), 'correct the commands so their batch applies atomically')
  }
  return { ok: true, document: current, batch, added }
}
