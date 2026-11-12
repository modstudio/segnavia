import type { Book } from '@segnavia/format'
import type { PreparedSlots } from '@segnavia/html'
import type { BookDestination } from './book-destinations.ts'
import type { OverflowEntry, RenderOptions } from './options.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'
import type { ParsedBookPdfOptions } from './renderer.ts'
import type { WatermarkPageFacts } from './watermark-stamp.ts'

export interface BookPdfAdapter {
  print(html: string, book: Book, slots: PreparedSlots, options: ParsedBookPdfOptions, part: BookOverflowPart, css?: string): Promise<PrintResult<true>>
  watermark?(pdf: Uint8Array, pages: readonly WatermarkPageFacts[]): Promise<Uint8Array>
  finish(pdf: Uint8Array, options: RenderOptions): Promise<Uint8Array>
}

export interface PrintedPart extends Pick<PrintResult, 'fontFamily' | 'fontFaceCss'> {
  bytes?: Uint8Array
  overflow?: OverflowEntry
  pages: number
  destinations: Map<string, BookDestination>
}
