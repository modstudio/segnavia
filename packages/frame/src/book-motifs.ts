import type { BookView, PageWidths } from '@segnavia/format'
import { bookViewMotifRefusal, expandFrameBookView, type MotifsOptions, type PlacementsOptions } from './motif-expansion.ts'
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
  placements?: PlacementsOptions,
  pageWidths?: PageWidths,
): Promise<{ view: BookView; css: string }> {
  if (!motifs && !fonts && !placements) return prepareBookViewWithoutSources(view)
  if (!motifs) {
    const refusal = bookViewMotifRefusal(view)
    if (refusal) throw refusal
  }
  const expanded = motifs || placements ? await expandFrameBookView(view, motifs, signal, placements, pageWidths) : { book: view, fonts: [] }
  return { view: expanded.book, css: await expandedBookFontCss(expanded, fonts, signal) }
}
