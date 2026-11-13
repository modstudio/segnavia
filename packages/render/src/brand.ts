import { type BrandSource, bookFromDocument, type Document, type DocumentInput, deckFromDocument, resolveBrand } from '@segnavia/format'
import { parseDocument, resolveEdition } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'

export async function resolveRenderBrand(document: Document, source: BrandSource | undefined, signal: AbortSignal) {
  try {
    return await resolveBrand(document, source, signal)
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}

export async function resolveRenderBook(
  input: DocumentInput,
  newId: (() => string) | undefined,
  source: BrandSource | undefined,
  signal: AbortSignal,
  edition?: string,
) {
  const document = resolveEdition(parseDocument(input, { newId }), edition)
  return bookFromDocument(document, await resolveRenderBrand(document, source, signal))
}

export async function resolveRenderDeck(
  input: DocumentInput,
  newId: (() => string) | undefined,
  source: BrandSource | undefined,
  signal: AbortSignal,
  edition?: string,
) {
  const document = resolveEdition(parseDocument(input, { newId }), edition)
  return deckFromDocument(document, await resolveRenderBrand(document, source, signal))
}
