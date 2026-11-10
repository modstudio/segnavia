import type { BookView, FontFailure, PageWidths, PreflightEntry, PreflightProfile } from '@segnavia/format'
import { bookViewMotifRefusal, expandFrameBookView, type MotifsOptions, type PlacementsOptions } from './motif-expansion.ts'
import { expandedBookFontCss, type FontsOptions, refuseMissingFontSource } from './page-fonts.ts'

export function prepareBookViewWithoutSources(view: BookView): { view: BookView; css: string; failures: FontFailure[]; preflight: PreflightEntry[] } {
  const refusal = bookViewMotifRefusal(view)
  if (refusal) throw refusal
  const place = view.title ? `book ${JSON.stringify(view.title)}` : 'book'
  refuseMissingFontSource(view.style?.fonts ?? {}, [], place)
  return { view, css: '', failures: [], preflight: [] }
}

export async function prepareBookView(
  view: BookView,
  motifs: MotifsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  pageWidths?: PageWidths,
  profile?: PreflightProfile,
): Promise<{ view: BookView; css: string; failures: FontFailure[]; preflight: PreflightEntry[] }> {
  if (!motifs && !fonts && !placements) return prepareBookViewWithoutSources(view)
  if (!motifs) {
    const refusal = bookViewMotifRefusal(view)
    if (refusal) throw refusal
  }
  const expanded =
    motifs || placements ? await expandFrameBookView(view, motifs, signal, placements, pageWidths, profile) : { book: view, fonts: [], preflight: [] }
  const { css, failures } = await expandedBookFontCss(expanded, fonts, signal)
  return { view: expanded.book, css, failures, preflight: expanded.preflight ?? [] }
}
