import type { AsOfDay, Book, DocumentInput } from '@segnavia/format'
import { expandFrameBookValue, type MotifsOptions } from '@segnavia/frame/motifs'
import type { AsOfInputs } from '@segnavia/html'
import { resolveRenderBook } from './brand.ts'
import type { ComposedRenderOptions } from './options.ts'
import { resolveRenderDayContext } from './page-as-of.ts'
import { renderOptionsWithBookFonts } from './page-document.ts'

export function expandRenderBook(book: Book, options: ComposedRenderOptions & { motifs?: MotifsOptions }, signal: AbortSignal, day: AsOfDay) {
  return expandFrameBookValue(book, options.motifs, signal, options.placements, 'print', options.pageWidths, day, options.preflight?.profile)
}

export async function prepareRenderBook<T extends ComposedRenderOptions & AsOfInputs & { motifs?: MotifsOptions }>(
  input: DocumentInput,
  options: T,
  signal: AbortSignal,
) {
  const book = await resolveRenderBook(input, options.newId, options.brandSource, signal, options.edition)
  const established = await resolveRenderDayContext(book, options, signal)
  const expanded = await expandRenderBook(book, options, signal, established.day)
  const prepared = await renderOptionsWithBookFonts(expanded.book, { ...options, slots: established.slots }, signal, expanded.fonts)
  return {
    ...prepared,
    options: prepared.options as T,
    book: expanded.book,
    established,
    preflight: expanded.preflight,
  }
}
