import type { AsOfDay, Book, DocumentInput } from '@segnavia/format'
import { expandFrameBookValue, type MotifsOptions } from '@segnavia/frame/motifs'
import { resolveRenderBook } from './brand.ts'
import type { ComposedRenderOptions } from './options.ts'
import { resolveRenderDayContext } from './page-as-of.ts'
import { renderOptionsWithBookFonts } from './page-document.ts'
import type { BookPlanOptions } from './renderer.ts'

export function expandRenderBook(book: Book, options: ComposedRenderOptions & { motifs?: MotifsOptions }, signal: AbortSignal, day: AsOfDay) {
  return expandFrameBookValue(book, options.motifs, signal, options.placements, 'print', options.pageWidths, day, options.preflight?.profile)
}

export async function prepareRenderBookPlan(input: DocumentInput, options: BookPlanOptions, signal: AbortSignal) {
  const book = await resolveRenderBook(input, options.newId, options.brandSource, signal)
  const established = await resolveRenderDayContext(book, options, signal)
  const expanded = await expandRenderBook(book, options, signal, established.day)
  return {
    ...(await renderOptionsWithBookFonts(expanded.book, { ...options, slots: established.slots }, signal, expanded.fonts)),
    book: expanded.book,
    established,
  }
}
