import type { CoverInput, DocumentInput, DocumentMetadata, ImpositionInput, PageOrPrintedInput, Plan } from '@segnavia/format'
import type { MotifsOptions } from '@segnavia/frame/motifs'
import type { PrintOptions } from '@segnavia/frame/print-document'
import type { CoverImageOptions } from './cover-image.ts'
import type { ComposedRenderOptions, ImageOptions, PageImageOptions, PageRenderOptions, ProofImageOptions, RenderOptions } from './options.ts'

export const RENDER_BOUND_MS = 60_000
export const PAGE_READY_BOUND_MS = 10_000
export const DEFAULT_JS_HEAP_MB = 2048
export const CONTAINER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']

export interface RendererOptions {
  executablePath: string
  args?: string[]
  // At most this many renders at once; the rest wait their turn.
  concurrency?: number
  // Caps each renderer process's JavaScript heap in megabytes. Defaults to DEFAULT_JS_HEAP_MB.
  jsHeapMb?: number
}

export type PagePdfOptions = PageRenderOptions & { motifs?: MotifsOptions; metadata?: DocumentMetadata }
export type BookPdfOptions = ComposedRenderOptions & { motifs?: MotifsOptions; plan?: Plan; breaks?: string[] }
export type BookPlanOptions = RenderOptions & { motifs?: MotifsOptions; breaks?: string[] }
export interface Renderer {
  bookPdf(book: DocumentInput, options?: BookPdfOptions): Promise<Uint8Array>
  bookPlan(book: DocumentInput, options?: BookPlanOptions): Promise<Plan>
  pagePdf(page: PageOrPrintedInput, options?: PagePdfOptions): Promise<Uint8Array>
  pagesPdf(pages: PageOrPrintedInput[], options?: PagePdfOptions & { imposition?: ImpositionInput }): Promise<Uint8Array>
  pageImage(page: PageOrPrintedInput, options?: PageImageOptions): Promise<Uint8Array>
  coverImage(cover: CoverInput, options: CoverImageOptions): Promise<Uint8Array>
  deckPdf(deck: DocumentInput, options?: RenderOptions & PrintOptions): Promise<Uint8Array>
  slideImage(deck: DocumentInput, index: number, options?: ImageOptions & Pick<PrintOptions, 'inline'>): Promise<Uint8Array>
  proofImage(image: Uint8Array, options: ProofImageOptions): Promise<Uint8Array>
  close(): Promise<void>
}
