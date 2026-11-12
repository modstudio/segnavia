import { type Book, resolveDirection } from '@segnavia/format'
import type { PrintedPart } from './book-pdf-types.ts'
import type { WatermarkPageFacts } from './watermark-stamp.ts'

export function bookWatermarkPageFacts(book: Book, parts: readonly PrintedPart[]): WatermarkPageFacts[] {
  const direction = resolveDirection(book.dir, book.lang, book.title)
  return parts.flatMap((part) =>
    Array.from({ length: part.pages }, () => ({
      direction,
      ...(book.lang ? { lang: book.lang } : {}),
      ...(part.fontFamily ? { fontFamily: part.fontFamily } : {}),
      ...(part.fontFaceCss ? { fontFaceCss: part.fontFaceCss } : {}),
    })),
  )
}
