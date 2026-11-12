import type { DocumentInput, Plan } from '@segnavia/format'
import type { BookPdfOptions, MotifsOptions } from '@segnavia/render'

export interface DemoBookOptions {
  css?: string
  motifs?: MotifsOptions
  preflight?: BookPdfOptions['preflight']
}

export type DemoBookPdf = (book: DocumentInput, options?: DemoBookOptions & { plan?: Plan }) => Promise<Uint8Array<ArrayBufferLike>>
export type DemoBookPlan = (book: DocumentInput, options?: DemoBookOptions) => Promise<Plan>

export async function replayBook(book: DocumentInput, options: DemoBookOptions | undefined, bookPdf: DemoBookPdf, bookPlan?: DemoBookPlan) {
  if (!bookPlan) return bookPdf(book, options)
  const plan = await bookPlan(book, options)
  return bookPdf(book, { ...options, plan })
}
