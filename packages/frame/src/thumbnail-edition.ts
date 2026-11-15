import type { Document, DocumentInput } from '@segnavia/format'
import { parseDocument, resolveEdition } from '@segnavia/html'

export type ThumbnailEditionSource = { kind: 'deck' | 'page'; document: Document }

export function changeThumbnailEditionSource(
  kind: ThumbnailEditionSource['kind'],
  input: DocumentInput | null | undefined,
  edition: string | undefined,
): { source: ThumbnailEditionSource | null; document: Document | null } {
  const document = input == null ? null : parseDocument(input)
  return {
    source: document && { kind, document },
    document: document && resolveEdition(document, edition),
  }
}

export function resolveThumbnailEditionSource(source: ThumbnailEditionSource | null, edition: string | undefined): ThumbnailEditionSource | null {
  return source && { kind: source.kind, document: resolveEdition(source.document, edition) }
}
