import type { BookView } from '@segnavia/format'
import { bookViewMotifRefusal, expandFrameBookView, type MotifsOptions } from './motif-expansion.ts'
import { expandedBookFontCss, type FontsOptions, refuseMissingFontSource } from './page-fonts.ts'

export function prepareBookViewWithoutSources(view: BookView): { view: BookView; css: string } {
  const refusal = bookViewMotifRefusal(view)
  if (refusal) throw refusal
  const place = view.title ? `book ${JSON.stringify(view.title)}` : 'book'
  refuseMissingFontSource(view.fonts ?? [], place)
  return { view, css: '' }
}

export async function prepareBookView(
  view: BookView,
  motifs: MotifsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<{ view: BookView; css: string }> {
  if (!motifs && !fonts) return prepareBookViewWithoutSources(view)
  if (!motifs) {
    const refusal = bookViewMotifRefusal(view)
    if (refusal) throw refusal
  }
  const expanded = motifs ? await expandFrameBookView(view, motifs, signal) : { book: view, fonts: [] }
  return { view: expanded.book, css: await expandedBookFontCss(expanded, fonts, signal) }
}
