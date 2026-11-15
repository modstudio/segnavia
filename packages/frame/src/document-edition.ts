import type { Document } from '@segnavia/format'
import { resolveEdition } from '@segnavia/html'

export function resolveDocumentEditions(documents: Document[], edition: string | undefined): Document[] {
  return documents.map((document) => resolveEdition(document, edition))
}
