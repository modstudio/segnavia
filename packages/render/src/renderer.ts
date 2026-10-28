import type { BookInput, Deck, ImpositionInput, PageInput } from '@segnavia/format'
import type { MotifsOptions } from '@segnavia/frame/motifs'
import type { PrintOptions } from '@segnavia/frame/print-document'
import type { ImageOptions, ProofImageOptions, RenderOptions } from './options.ts'

export const RENDER_BOUND_MS = 60_000
export const PAGE_READY_BOUND_MS = 10_000
export const CONTAINER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']

export interface RendererOptions {
  executablePath: string
  args?: string[]
  // At most this many renders at once; the rest wait their turn.
  concurrency?: number
  // Caps each page's JavaScript heap, for hosts rendering code they did not write.
  jsHeapMb?: number
}

export type PagePdfOptions = RenderOptions & { motifs?: MotifsOptions }

export interface Renderer {
  bookPdf(book: BookInput, options?: RenderOptions): Promise<Uint8Array>
  pagePdf(page: PageInput, options?: PagePdfOptions): Promise<Uint8Array>
  pagesPdf(pages: PageInput[], options?: PagePdfOptions & { imposition?: ImpositionInput }): Promise<Uint8Array>
  pageImage(page: PageInput, options?: ImageOptions): Promise<Uint8Array>
  deckPdf(deck: Deck, options?: RenderOptions & PrintOptions): Promise<Uint8Array>
  slideImage(deck: Deck, index: number, options?: ImageOptions & Pick<PrintOptions, 'inline'>): Promise<Uint8Array>
  proofImage(image: Uint8Array, options: ProofImageOptions): Promise<Uint8Array>
  close(): Promise<void>
}
