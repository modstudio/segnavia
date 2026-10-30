import type { BookView } from '@segnavia/format'
import { expandFrameBookView, type MotifsOptions } from './motif-expansion.ts'
import { type FontsOptions, refuseMissingFontSource, resolveFontReferences, uniqueFontReferences } from './page-fonts.ts'

export async function prepareBookView(
  view: BookView,
  motifs: MotifsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<{ view: BookView; css: string | undefined }> {
  const expanded = motifs ? await expandFrameBookView(view, motifs, signal) : { book: view, fonts: [] }
  const references = uniqueFontReferences([...(expanded.book.fonts ?? []), ...expanded.fonts])
  const place = expanded.book.title ? `book ${JSON.stringify(expanded.book.title)}` : 'book'
  if (!fonts) {
    refuseMissingFontSource(references, place)
    return { view: expanded.book, css: undefined }
  }
  return { view: expanded.book, css: await resolveFontReferences(references, fonts, signal, place) }
}
