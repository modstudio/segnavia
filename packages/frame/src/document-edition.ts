import type { Document, DocumentInput } from '@segnavia/format'
import { parseDocument, resolveEdition } from '@segnavia/html'

export function resolveDocumentEditions(documents: Document[], edition: string | undefined): Document[] {
  return documents.map((document) => resolveEdition(document, edition))
}

export function parseDocumentEditions(inputs: DocumentInput[], edition: string | undefined): { authored: Document[]; resolved: Document[] } {
  const authored = inputs.map((input) => parseDocument(input))
  return { authored, resolved: resolveDocumentEditions(authored, edition) }
}
