import type { Book } from '@segnavia/format'
import type { PreparedSlots } from '@segnavia/html'
import type { BookDestination } from './book-destinations.ts'
import type { OverflowEntry, RenderOptions } from './options.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'

export interface BookPdfAdapter {
  print(html: string, book: Book, slots: PreparedSlots, options: RenderOptions, part: BookOverflowPart, css?: string): Promise<PrintResult<true>>
  finish(pdf: Uint8Array, options: RenderOptions): Promise<Uint8Array>
}

export interface PrintedPart {
  bytes?: Uint8Array
  overflow?: OverflowEntry
  pages: number
  destinations: Map<string, BookDestination>
}
